# dedupe-recovered.rb - remove duplicatas criadas por 2 execucoes simultaneas do
# recover-group-sent.rb (Ctrl+C no `docker exec -i` nao mata o processo no container).
# Por (caixa, WAID) mantem 1: a que tem arquivo; senao a mais antiga. So mexe no TAG.
# DRY-RUN se COMMIT != 1.

TAG    = 'evolution-lid-backfill-2026-10'.freeze
COMMIT = ENV['COMMIT'] == '1'

others = Dir['/proc/[0-9]*/cmdline'].filter_map do |f|
  pid = f[%r{/proc/(\d+)/}, 1].to_i
  next if [Process.pid, Process.ppid].include?(pid)

  cmd = begin
    File.read(f).tr("\0", ' ')
  rescue StandardError
    ''
  end
  "#{pid}: #{cmd[0, 80]}" if cmd.include?('runner')
end
abort "ABORTADO: outro rails runner ainda rodando no container: #{others.inspect}" if others.any?

ms     = Message.unscoped.where("additional_attributes->>'recovered_by' = ?", TAG)
groups = ms.group(:inbox_id, :source_id).having('count(*) > 1').count
cross  = Message.unscoped.where(message_type: 1, source_id: ms.select(:source_id))
                .where("additional_attributes->>'recovered_by' IS DISTINCT FROM ?", TAG).count
puts "recuperadas=#{ms.count} waid_unicos=#{ms.distinct.count(:source_id)} waid_duplicados=#{groups.size} " \
     "linhas_extras=#{groups.values.sum - groups.size} colide_com_nao_recuperada=#{cross}"

del = []
groups.each_key do |(inbox_id, sid)|
  rows  = ms.where(inbox_id: inbox_id, source_id: sid).order(:id).to_a
  keep  = rows.find { |m| m.attachments.any? } || rows.first
  extra = rows - [keep]
  puts "  #{sid} conversa=#{keep.conversation_id} mantem=#{keep.id}#{' (com arquivo)' if keep.attachments.any?} " \
       "apaga=#{extra.map(&:id).join(',')}" if del.size < 40
  del.concat(extra.map(&:id))
end

if COMMIT && del.any?
  atts = Attachment.where(message_id: del).to_a
  ActiveRecord::Base.transaction do
    Attachment.where(message_id: del).delete_all
    Message.unscoped.where(id: del).delete_all
  end
  atts.each { |a| a.file.purge if a.file.attached? }
end

left = Message.unscoped.where("additional_attributes->>'recovered_by' = ?", TAG)
ids  = left.pluck(:id)
com  = Attachment.where(message_id: ids).distinct.count(:message_id)
sem  = left.where('content LIKE ?', '%recuperar]%').count
puts "#{COMMIT ? 'APAGADAS' : 'apagaria'}=#{del.size} | " \
     "#{COMMIT ? 'agora' : 'hoje'}: recuperadas=#{ids.size} midia_com_arquivo=#{com} midia_sem_arquivo=#{sem} texto=#{ids.size - com - sem}"
