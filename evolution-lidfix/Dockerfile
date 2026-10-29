FROM evoapicloud/evolution-api:v2.3.7
# Evolution 2.3.7 descarta mensagem de GRUPO quando o participante vem como @lid:
# parsePhoneNumberFromString("+<lid>") -> undefined -> .formatInternational() -> TypeError.
# Afeta enviadas pelo celular (fromMe sempre usa participant) e recebidas @lid sem participantAlt.
# Upstream (main, out/2026) ainda tem o bug. REAPLICAR em qualquer troca de versao da Evolution.
RUN f=/evolution/dist/main.js \
 && test "$(grep -o ').formatInternational()' $f | wc -l)" = 2 \
 && sed -i 's/)\.formatInternational()/)?.formatInternational()||"Participante"/g' $f \
 && test "$(grep -o 'formatInternational()||"Participante"' $f | wc -l)" = 2 \
 && node --check $f
