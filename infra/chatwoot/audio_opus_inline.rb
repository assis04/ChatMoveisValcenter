# Custom Chatwoot patch — Chatcenter
# Inclui 'audio/opus' (e variantes do WhatsApp via Evolution) na allowlist de
# Content-Disposition: inline do ActiveStorage. Sem isso, browsers baixam os
# áudios em vez de tocar no player do Chatwoot.
Rails.application.config.active_storage.content_types_allowed_inline += %w[
  audio/opus
  audio/ogg; codecs=opus
  audio/oga
]
