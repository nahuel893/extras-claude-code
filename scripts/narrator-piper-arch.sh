#!/usr/bin/env bash
# Gives better-claude's narrator mod a natural voice on Arch Linux: Piper, through speech-dispatcher.
#
# The narrator speaks with `spd-say` when speech-dispatcher is installed, else espeak-ng. This
# installs speech-dispatcher, the Piper engine (AUR piper-tts-bin) and one Piper voice package
# (AUR piper-voices-<locale>), whose install scripts make Piper speech-dispatcher's default module
# and the voice its default voice.
#
# Usage: scripts/narrator-piper-arch.sh [locale]   (default es-ar; e.g. en-us, es-es, pt-br)
#
# piper-tts-bin's PKGBUILD can carry a stale checksum for its three-line wrapper script. When the
# normal build fails, the script checks the Piper binary tarball against the PKGBUILD's checksum
# itself, shows the wrapper, and only then asks to build with the checksums skipped.
set -euo pipefail

locale="${1:-es-ar}"
voice_pkg="piper-voices-${locale}"

die() { printf 'error: %s\n' "$*" >&2; exit 1; }
step() { printf '\n==> %s\n' "$*"; }

[[ $EUID -ne 0 ]] || die 'run it as your user, not root: makepkg refuses root and sudo is asked for when needed'
command -v pacman >/dev/null || die 'pacman not found: this script is for Arch Linux and derivatives'

aur=''
for helper in yay paru; do
  if command -v "$helper" >/dev/null; then aur="$helper"; break; fi
done
[[ -n $aur ]] || die 'an AUR helper is needed for the voice package: install yay or paru'

step 'speech-dispatcher, ALSA tools and build tools'
sudo pacman -S --needed speech-dispatcher alsa-utils git base-devel

# A subshell, so its cd and its cleanup stay inside it.
install_piper() (
  local dir arch tarball expected actual
  dir="$(mktemp -d)"
  trap 'rm -rf "$dir"' EXIT
  git clone --depth 1 https://aur.archlinux.org/piper-tts-bin.git "$dir"
  cd "$dir"

  if makepkg -si --needed; then return; fi

  printf '\nThe normal build failed. Checking whether only the wrapper checksum is stale.\n'
  arch="$(uname -m)"
  # The PKGBUILD names the tarball and its checksum per architecture.
  tarball="$(bash -c 'source PKGBUILD; eval "s=(\"\${source_$1[@]}\")"; basename "${s[0]}"' _ "$arch")"
  expected="$(bash -c 'source PKGBUILD; eval "s=(\"\${sha256sums_$1[@]}\")"; printf %s "${s[0]}"' _ "$arch")"
  [[ -f $tarball && -n $expected ]] || die "no downloaded Piper tarball for $arch to check"
  actual="$(sha256sum "$tarball" | cut -d' ' -f1)"
  [[ $actual == "$expected" ]] || die "the Piper tarball does not match the PKGBUILD's checksum: not installing"

  printf 'The Piper tarball matches the PKGBUILD checksum (%s).\n' "$expected"
  printf 'The wrapper whose checksum failed, installed as /usr/bin/piper-tts:\n\n'
  sed 's/^/    /' piper-tts.sh
  printf '\n'
  local answer
  read -rp 'Build with the checksums skipped? [y/N] ' answer
  [[ $answer == [yY] ]] || die 'stopped: nothing installed'
  makepkg -si --needed --skipchecksums
)

step 'Piper engine (AUR piper-tts-bin)'
if pacman -Qq piper-tts-bin >/dev/null 2>&1; then
  printf 'piper-tts-bin is already installed.\n'
else
  install_piper
fi

step "Piper voice (AUR $voice_pkg)"
"$aur" -S --needed "$voice_pkg"

step 'Restarting speech-dispatcher'
pkill -x speech-dispatcher || true

step 'Trying it'
spd-say -w -l "${locale%%-*}" 'Piper is ready.' || printf 'spd-say failed: check /etc/speech-dispatcher/speechd.conf\n'

printf '\nDone. In Claude Code, run /reload-plugins so the narrator picks speech-dispatcher up.\n'
