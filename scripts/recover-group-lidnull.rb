# recover-group-lidnull.rb - Fork Valcenter (2026-11-05)
#
# Recupera mensagens de GRUPO RECEBIDAS que a Evolution tem no evolution_db e o Chatwoot
# nao: as reenviadas pelo celular apos falha de descriptografia, que chegavam sem
# key.participant (pushName = "<lid>@lid") e quebravam o ChatwootService
# (participant.split). Corrigido na imagem evolution-lidfix2 (patch-lidnull.js).
#
# Seguro por padrao:
#  - DRY-RUN se COMMIT != 1: nao grava nada e nao chama a Evolution.
#  - insert_all (SEM callbacks): sem webhook, sem notificacao, sem automacao.
#  - Idempotente: pula WAID que ja existe na caixa.
#  - So grava se a conversa do grupo JA existia no Chatwoot no horario da mensagem
#    (o que e anterior a conversa e historico importado, nao perda).
#  - Autor: LID -> telefone por outra msg do mesmo LID; nome pelo Contact da Evolution.
#    Sem telefone: "Participante (nao identificado)".
#  - Marca cada linha com additional_attributes.recovered_by = TAG.
#
# Uso: docker exec -i [-e COMMIT=1] [-e ONLY=<instancia>] [-e FROM=2026-09-01] \
#        chatcenter_chatwoot_web bundle exec rails runner - < recover-group-lidnull.rb
#
# Revert (rails runner):
#   ids = Message.unscoped.where("additional_attributes->>'recovered_by' = ?", TAG).pluck(:id)
#   Attachment.where(message_id: ids).find_each { |a| a.file.purge; a.delete }
#   Message.unscoped.where(id: ids).delete_all

TAG      = 'evolution-lidnull-backfill-2026-11'.freeze
COMMIT   = ENV['COMMIT'] == '1'
ONLY     = ENV['ONLY'].presence
FROM     = Time.zone.parse(ENV.fetch('FROM', '2026-09-01'))
WRAPPERS = %w[ephemeralMessage viewOnceMessage viewOnceMessageV2 viewOnceMessageV2Extension
              documentWithCaptionMessage associatedChildMessage].freeze
MEDIA    = { 'imageMessage' => :image, 'videoMessage' => :video, 'audioMessage' => :audio,
             'documentMessage' => :file, 'stickerMessage' => :image }.freeze
LABEL    = { image: 'imagem', video: "v\u{ed}deo", audio: "\u{e1}udio", file: 'documento' }.freeze
UNKNOWN  = "Participante (n\u{e3}o identificado)".freeze

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

# Mesma conversao de formatacao que a Evolution faz antes de mandar ao Chatwoot.
def wa_markdown(text)
  text.gsub(/\*((?!\s)([^\n*]+?)(?<!\s))\*/, '**\1**')
      .gsub(/_((?!\s)([^\n_]+?)(?<!\s))_/, '*\1*')
      .gsub(/~((?!\s)([^\n~]+?)(?<!\s))~/, '~~\1~~')
end

# Formato do formatInternational da libphonenumber para BR; outros paises so com "+".
def phone_fmt(digits)
  if digits.start_with?('55') && [12, 13].include?(digits.size)
    ddd = digits[2, 2]
    num = digits[4..]
    "+55 #{ddd} #{num[0...-4]}-#{num[-4..]}"
  else
    "+#{digits}"
  end
end

# "**+55 11 9xxxx-xxxx - Nome:**\n\ntexto" -> "texto" (para comparar com o que ja existe)
def strip_prefix(text)
  text.to_s.sub(/\A\*\*[^\n]{1,120}:\*\*\s*/, '').squish
end

# O pushName dessas msgs e o LID do remetente: "<digitos>@lid" (reenvio) ou so "<digitos>" (historico).
def lid_of(push_name)
  v = push_name.to_s
  return v if v.end_with?('@lid')

  v.match?(/\A\d{8,16}\z/) ? "#{v}@lid" : nil
end

inbox_by_inst = {}
Inbox.where(channel_type: 'Channel::Api').includes(:channel).find_each do |ib|
  inst = Evolution::ApiClient.instance_from_webhook(ib.channel.try(:webhook_url))
  inbox_by_inst[inst] = ib if inst.present?
end

sql = EvoDb.sanitize_sql_array([<<~SQL, FROM.to_i])
  SELECT i.name AS inst, m."key"->>'id' AS wid, m."key"->>'remoteJid' AS jid, m."pushName" AS lid,
         m."messageType" AS mtype, m."message" AS msg, m."messageTimestamp" AS ts
  FROM "Message" m JOIN "Instance" i ON i.id = m."instanceId"
  WHERE m."key"->>'remoteJid' LIKE '%@g.us' AND m."key"->>'participant' IS NULL
    AND NOT (m."key"->>'fromMe')::boolean AND m."chatwootMessageId" IS NULL
    AND m."messageTimestamp" >= ?
  ORDER BY m."messageTimestamp"
SQL
rows = EvoDb.connection.select_all(sql).to_a
rows.select! { |r| r['inst'] == ONLY } if ONLY

# Autor: LID -> telefone (outras msgs do mesmo LID) e telefone -> nome (Contact da Evolution)
lids = rows.map { |r| lid_of(r['lid']) }.compact.uniq
pn_by_lid = {}
if lids.any?
  EvoDb.connection.select_rows(EvoDb.sanitize_sql_array([<<~SQL, lids])).each { |lid, pn| pn_by_lid[lid] = pn }
    SELECT "key"->>'participant', max("key"->>'participantAlt') FROM "Message"
    WHERE "key"->>'participant' IN (?) AND "key"->>'participantAlt' IS NOT NULL GROUP BY 1
  SQL
end
name_by_pn = {}
if pn_by_lid.any?
  EvoDb.connection.select_rows(EvoDb.sanitize_sql_array([<<~SQL, pn_by_lid.values.uniq])).each { |pn, n| name_by_pn[pn] ||= n }
    SELECT "remoteJid", "pushName" FROM "Contact"
    WHERE "remoteJid" IN (?) AND "pushName" IS NOT NULL AND "pushName" NOT LIKE '%@lid'
  SQL
end

stats   = Hash.new { |h, k| h[k] = Hash.new(0) }
ignored = Hash.new(0)
samples = []
per_inst = Hash.new(0)
errors  = []
client  = Evolution::ApiClient.new

rows.each do |r|
  inst = r['inst']
  s = stats[inst]
  ib = inbox_by_inst[inst]
  next s[:sem_caixa] += 1 unless ib

  sid = "WAID:#{r['wid']}"
  next s[:ja_existe] += 1 if Message.unscoped.where(inbox_id: ib.id, source_id: sid).exists?

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
  conv = Conversation.where(contact_inbox_id: ci.id).where('created_at <= ?', at + 5.minutes).order(:id).last
  next s[:anterior_a_conversa] += 1 unless conv

  ftype = mkey && MEDIA[mkey]
  body = text || (mkey && msg.dig(mkey, 'caption').presence)
  body = wa_markdown(body) if body

  pn = pn_by_lid[lid_of(r['lid'])]
  digits = pn.to_s.split('@').first.to_s.split(':').first.to_s
  # Sem LID (veio pela sincronizacao de historico): so o nome de perfil, sem telefone.
  pname = lid_of(r['lid']) ? nil : r['lid'].presence
  author = pn ? "#{phone_fmt(digits)} - #{name_by_pn[pn].presence || 'Participante'}" : (pname || UNKNOWN)
  prefix = "**#{author}:**"
  content = body ? "#{prefix}\n\n#{body}" : prefix

  near = Message.unscoped.where(conversation_id: conv.id, message_type: 0,
                                created_at: (at - 2.minutes)..(at + 2.minutes))
                .where("additional_attributes->>'recovered_by' IS DISTINCT FROM ?", TAG)
  if near.any? { |m| strip_prefix(m.content) == strip_prefix(content) && (ftype.nil? || m.attachments.any?) }
    next s[:possivel_duplicata] += 1
  end

  s[ftype ? :midia : :texto] += 1
  s[pn ? :autor_ok : (pname ? :autor_so_nome : :autor_desconhecido)] += 1
  if per_inst[inst] < 3
    samples << format('%s %-12s #%-5s %-9s autor=%-24s %s', at.in_time_zone('America/Sao_Paulo').strftime('%d/%m %H:%M'),
                      ib.name[0, 12], conv.display_id, ftype ? LABEL[ftype] : 'texto',
                      (pn ? name_by_pn[pn].presence || 'Participante' : (pname ? "#{pname} (s/tel)" : 'desconhecido'))[0, 24],
                      body.to_s.tr("\n", ' ')[0, 40].inspect)
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
    content = "#{content}\n\n\u{1F4CE} [#{LABEL[ftype]} - n\u{e3}o foi poss\u{ed}vel recuperar o arquivo]"
  end

  ActiveRecord::Base.transaction do
    id = Message.insert_all(
      [{ account_id: ib.account_id, inbox_id: ib.id, conversation_id: conv.id,
         message_type: 0, content_type: 0, status: 0, private: false, # incoming / text / sent
         content: content, processed_message_content: content, source_id: sid,
         sender_type: 'Contact', sender_id: conv.contact_id, created_at: at, updated_at: Time.current,
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

puts "#{COMMIT ? 'COMMIT' : 'DRY-RUN'} | desde #{FROM.to_date} | #{rows.size} recebidas em grupo sem participant" \
     "#{" | so #{ONLY}" if ONLY} | LIDs=#{lids.size} com_telefone=#{pn_by_lid.size} com_nome=#{name_by_pn.size}"
stats.sort.each { |inst, h| puts format('  %-20s %s', inst, h.map { |k, v| "#{k}=#{v}" }.join(' ')) }
puts "  ignoradas por tipo: #{ignored.sort_by { |_, v| -v }.map { |k, v| "#{k}=#{v}" }.join(' ')}"
puts '  amostra:'
samples.each { |l| puts "    #{l}" }
errors.each { |l| puts "  ERRO #{l}" }
puts "  TAG=#{TAG}" if COMMIT
