#!/bin/bash
# Yerel çalışanı (Mac). Çift tıklayarak açın.
cd "$(dirname "$0")/../.." || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js bulunamadı. https://nodejs.org adresinden LTS sürümünü kurup bu dosyayı tekrar açın."
  read -r -p "Kapatmak için Enter'a basın."
  exit 1
fi
echo "Gerekli paketler hazırlanıyor (ilk açılışta birkaç dakika sürebilir)..."
npx -y pnpm@10.28.0 install --filter "@hfo/runner..." --no-frozen-lockfile || { echo "Paketler kurulamadı. İnternet bağlantınızı kontrol edin."; read -r; exit 1; }
npx -y pnpm@10.28.0 --filter @hfo/runner start "$@"
