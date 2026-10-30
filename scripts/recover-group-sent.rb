# recover-group-sent.rb - Fork Valcenter (2026-10-30)
#
# Recupera mensagens de GRUPO enviadas pelo CELULAR (fromMe) que a Evolution tem
# no evolution_db e o Chatwoot nao: perdidas pelo bug LID da Evolution 2.3.7
# (TypeError formatInternational; corrigido pela imagem evolution-lidfix).
#
# Seguro por padrao:
#  - DRY-RUN se COMMIT != 1: nao grava nada e nao chama a Evolution.
#  - Insere com insert_all (SEM callbacks): nao dispara webhook, entao nada e
#    reenviado ao WhatsApp nem ao CRM, e nao mexe em atribuicao/automacao.
#  - Idempotente: pula WAID que ja existe como outgoing na mesma caixa.
#  - So grava em conversa que JA existe; grupo sem conversa so e reportado.
#  - So grava em conta onde o usuario de servico (SENDER_ID) e membro.
#  - Marca cada linha com additional_attributes.recovered_by = TAG.
#
# Uso (script via stdin no container web):
#   docker exec -i [-e COMMIT=1] [-e ONLY=<instancia>] [-e FROM=2026-09-15] \
#     chatcenter_chatwoot_web bundle exec rails runner - < recover-group-sent.rb
#
# Revert (rails runner):
#   ids = Message.unscoped.where("additional_attributes->>'recovered_by' = ?", TAG).pluck(:id)
#   Attachment.where(message_id: ids).find_each { |a| a.file.purge; a.delete }
#   Message.unscoped.where(id: ids).delete_all

TAG      = 'evolution-lid-backfill-2026-10'.freeze
COMMIT   = ENV['COMMIT'] == '1'
ONLY     = ENV['ONLY'].presence
FROM     = Time.zone.parse(ENV.fetch('FROM', '2026-09-15'))
FIX_AT   = Time.utc(2026, 10, 29, 19, 5)
WRAPPERS = %w[ephemeralMessage viewOnceMessage viewOnceMessageV2 viewOnceMessageV2Extension
              documentWithCaptionMessage associatedChildMessage].freeze
MEDIA    = { 'imageMessage' => :image, 'videoMessage' => :video, 'audioMessage' => :audio,
             'documentMessage' => :file, 'stickerMessage' => :image }.freeze
LABEL    = { image: 'imagem', video: "v\u{ed}deo", audio: "\u{e1}udio", file: 'documento' }.freeze

sender = User.find(Integer(ENV.fetch('SENDER_ID', '32')))

class EvoDb < ActiveRecord::Base
  self.abstract_class = true
end
EvoDb.establish_connection(
  ActiveRecord::Base.connection_db_config.configuration_hash.except(:url).merge(database: 'evolution_db')
)

def unwrap(msg)
  4.times do
    inner = WRAPPERS.map { |k| msg.dig(k, 'message') }.find { |v| v.is_a?(Hash) }
    break unless inner

    msg = inner
  end
  msg
end

# "*Fulano:* texto" (assinatura da Evolution) e "*Fulano*: texto" (assinatura manual)
def strip_sig(text)
  text.to_s.sub(/\A\*[^*\n]{1,60}(?::\*|\*:)\s*/, '').squish
end

inbox_by_inst = {}
Inbox.where(channel_type: 'Channel::Api').includes(:channel).find_each do |ib|
  inst = Evolution::ApiClient.instance_from_webhook(ib.channel.try(:webhook_url))
  inbox_by_inst[inst] = ib if inst.present?
end
member_accounts = AccountUser.where(user_id: sender.id).pluck(:account_id)

sql = EvoDb.sanitize_sql_array([<<~SQL, FROM.to_i])
  SELECT i.name AS inst, m."key"->>'id' AS wid, m."key"->>'remoteJid' AS jid,
         m."messageType" AS mtype, m."message" AS msg, m."messageTimestamp" AS ts
  FROM "Message" m JOIN "Instance" i ON i.id = m."instanceId"
  WHERE m."key"->>'remoteJid' LIKE '%@g.us' AND (m."key"->>'fromMe')::boolean
    AND m."messageTimestamp" >= ?
  ORDER BY m."messageTimestamp"
SQL
rows = EvoDb.connection.select_all(sql).to_a
rows.select! { |r| r['inst'] == ONLY } if ONLY

stats   = Hash.new { |h, k| h[k] = Hash.new(0) }
ignored = Hash.new(0)
samples = []
postfix = []
per_inst = Hash.new(0)
errors  = []
client  = Evolution::ApiClient.new

rows.each do |r|
  inst = r['inst']
  s = stats[inst]
  ib = inbox_by_inst[inst]
  next s[:sem_caixa] += 1 unless ib
  next s[:conta_sem_usuario_servico] += 1 unless member_accounts.include?(ib.account_id)

  sid = "WAID:#{r['wid']}"
  next s[:ja_existe] += 1 if Message.unscoped.where(inbox_id: ib.id, message_type: 1, source_id: sid).exists?

  raw = r['msg'].is_a?(String) ? JSON.parse(r['msg']) : r['msg']
  msg = unwrap(raw.is_a?(Hash) ? raw : {})
  text = msg['conversation'].presence || msg.dig('extendedTextMessage', 'text').presence
  mkey = MEDIA.keys.find { |k| msg[k].is_a?(Hash) }
  unless text || mkey
    ignored[r['mtype']] += 1
    next s[:ignorada] += 1
  end

  contact = Contact.find_by(account_id: ib.account_id, identifier: r['jid'])
  ci = contact && ContactInbox.find_by(contact_id: contact.id, inbox_id: ib.id)
  next s[:sem_conversa] += 1 unless ci

  at = Time.zone.at(r['ts'].to_i)
  convs = Conversation.where(contact_inbox_id: ci.id).order(:id)
  conv = convs.where('created_at <= ?', at + 5.minutes).last || convs.first
  next s[:sem_conversa] += 1 unless conv

  ftype = mkey && MEDIA[mkey]
  content = text || (mkey && msg.dig(mkey, 'caption').presence)
  # "*Nome:*" e a assinatura que a Evolution poe no que o AGENTE manda pelo Chatwoot:
  # a mensagem original ja esta no Chatwoot (album = 1 msg la, N ids aqui). Nunca recuperar.
  next s[:enviada_pelo_chatwoot] += 1 if content.to_s.match?(/\A\*[^*\n]{1,60}:\*/)

  # Rede de seguranca contra duplicata: msg enviada pelo Chatwoot cujo source_id
  # nao foi gravado. Mesma conversa, +-2 min, mesmo texto sem assinatura.
  # Ignora as ja recuperadas (fotos em sequencia sem legenda nao sao duplicata entre si).
  near = Message.unscoped.where(conversation_id: conv.id, message_type: 1,
                                created_at: (at - 2.minutes)..(at + 2.minutes))
         .where("additional_attributes->>'recovered_by' IS DISTINCT FROM ?", TAG)
  if near.any? { |m| strip_sig(m.content) == strip_sig(content) && (ftype.nil? || m.attachments.any?) }
    next s[:possivel_duplicata] += 1
  end

  s[ftype ? :midia : :texto] += 1
  line = format('%s %-12s #%-5s %-9s %s', at.in_time_zone('America/Sao_Paulo').strftime('%d/%m %H:%M'),
                ib.name[0, 12], conv.display_id, ftype ? LABEL[ftype] : 'texto',
                content.to_s.tr("\n", ' ')[0, 50].inspect)
  if at >= FIX_AT
    s[:depois_do_fix] += 1
    postfix << "#{line} #{r['mtype']} #{r['wid']}"
  end
  if per_inst[inst] < 4
    samples << line
    per_inst[inst] += 1
  end
  next unless COMMIT

  media = nil
  if ftype
    resp = client.send(:http_post, "/chat/getBase64FromMediaMessage/#{ERB::Util.url_encode(inst)}",
                       { message: { key: { id: r['wid'] } }, convertToMp4: false }, timeout: 90)
    media = resp if resp.is_a?(Hash) && resp['base64'].present?
    sleep 1
  end
  if ftype && !media
    note = "\u{1F4CE} [arquivo de #{LABEL[ftype]} enviado pelo celular - n\u{e3}o foi poss\u{ed}vel recuperar]"
    content = [content, note].compact.join("\n\n")
  end

  ActiveRecord::Base.transaction do
    id = Message.insert_all(
      [{ account_id: ib.account_id, inbox_id: ib.id, conversation_id: conv.id,
         message_type: 1, content_type: 0, status: 0, private: false, # outgoing / text / sent
         content: content, processed_message_content: content, source_id: sid,
         sender_type: 'User', sender_id: sender.id, created_at: at, updated_at: Time.current,
         additional_attributes: { 'recovered_by' => TAG } }],
      returning: %w[id], record_timestamps: false
    ).rows.first.first
    if media
      mime = media['mimetype'].presence || 'application/octet-stream'
      fname = media['fileName'].presence || "#{r['wid']}.bin"
      blob = ActiveStorage::Blob.create_and_upload!(io: StringIO.new(Base64.decode64(media['base64'])),
                                                    filename: fname, content_type: mime)
      Attachment.create!(account_id: ib.account_id, message_id: id, file_type: ftype, file: blob)
    end
  end
  s[:gravada] += 1
  s[:arquivo_ok] += 1 if media
rescue StandardError => e
  stats[r['inst']][:erro] += 1
  errors << "#{r['wid']}: #{e.class} #{e.message[0, 120]}" if errors.size < 5
end

puts "#{COMMIT ? 'COMMIT' : 'DRY-RUN'} | desde #{FROM.to_date} | #{rows.size} enviadas em grupo lidas da Evolution" \
     "#{" | so #{ONLY}" if ONLY} | remetente ##{sender.id} #{sender.name}"
stats.sort.each { |inst, h| puts format('  %-20s %s', inst, h.map { |k, v| "#{k}=#{v}" }.join(' ')) }
puts "  ignoradas por tipo: #{ignored.sort_by { |_, v| -v }.map { |k, v| "#{k}=#{v}" }.join(' ')}"
puts '  amostra:'
samples.each { |l| puts "    #{l}" }
puts '  depois do fix (deveria ser vazio):' if postfix.any?
postfix.each { |l| puts "    #{l}" }
errors.each { |l| puts "  ERRO #{l}" }
puts "  TAG=#{TAG}" if COMMIT
