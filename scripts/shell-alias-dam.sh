# MWT DAM shell shortcut — source this file, or paste the alias into ~/.zshrc.
#
#   source /Users/administrator/src/DAMMWT/scripts/shell-alias-dam.sh
#
# Then:  dam            → rebuild + launch Electron Gallery
#        SEED=1 dam     → same with media re-seed
#
# Optional one-time ~/.zshrc append (only if `dam` alias is missing):
#   if ! grep -q 'shell-alias-dam.sh' ~/.zshrc 2>/dev/null; then
#     echo '' >> ~/.zshrc
#     echo '# MWT DAM quick launch (dam) — review before keeping' >> ~/.zshrc
#     echo 'source /Users/administrator/src/DAMMWT/scripts/shell-alias-dam.sh' >> ~/.zshrc
#   fi

DAMMWT_ROOT="${DAMMWT_ROOT:-/Users/administrator/src/DAMMWT}"

dam() {
  (
    cd "$DAMMWT_ROOT" || return 1
    npm run review:electron
  )
}
