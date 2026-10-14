# Pinned TeX Live container image for trusted execution (S06-T03, CMP-01, PL-07)
FROM debian:bookworm-slim@sha256:3a60a08e1a1b1424ef84c7ef60ee48b04005c5c00e129e9336d8fe370b33364f

LABEL maintainer="Collaborative LaTeX Editor Team"
LABEL version="2024.1"
LABEL description="Pinned, unprivileged TeX Live container for isolated LaTeX compilation"

ENV DEBIAN_FRONTEND=noninteractive
ENV LANG=C.UTF-8

# Install minimal TeX Live packages, latexmk, and biber
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      texlive-latex-base \
      texlive-latex-recommended \
      texlive-fonts-recommended \
      texlive-bibtex-extra \
      latexmk \
      biber \
      ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Copy hardened TeX configuration (shell_escape = f, openin_any = p)
COPY texmf.cnf /etc/texmf/web2c/texmf.cnf

# Create unprivileged runner user (no secrets, non-root)
RUN groupadd -g 10001 texrunner && \
    useradd -u 10001 -g texrunner -m -s /bin/false texrunner && \
    mkdir -p /work/input /work/out /work/cache && \
    chown -R texrunner:texrunner /work

WORKDIR /work
USER texrunner

# Default execution profile uses hardened flags without shell escape
CMD ["latexmk", "-pdf", "-interaction=nonstopmode", "-file-line-error", "-synctex=1", "-no-shell-escape", "-outdir=/work/out", "/work/input/main.tex"]
