# Usa la imagen base de Ubuntu 18.04 LTS (Bionic Beaver)
FROM ubuntu:18.04

# Variables de entorno
ENV TINI_VERSION=v0.19.0
ENV DEBIAN_FRONTEND=noninteractive
# Definir la versión de cloudflared a instalar (puedes ajustarla)
ENV CLOUDFLARED_VERSION 2025.9.1 

# 1. INSTALACIÓN DE HERRAMIENTAS CRÍTICAS Y DEPENDENCIAS
# Aseguramos wget y las herramientas base
RUN apt-get update && apt-get install -y \
    curl \
    netcat \
    build-essential \
    wget \
    git \
    nano \
    lsb-release \
    gpg \
    && rm -rf /var/lib/apt/lists/*

# 2. INSTALAR NODE.JS 16
RUN curl -fsSL https://deb.nodesource.com/setup_16.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# 3. INSTALAR TINI (Descarga de GitHub)
RUN wget -q -O /usr/local/bin/tini https://github.com/krallin/tini/releases/download/${TINI_VERSION}/tini && \
    chmod +x /usr/local/bin/tini

# 4. INSTALAR CLOUDFLARED (BINARIO - FIX para el 404)
# Descarga el binario oficial para Linux 64-bit y lo mueve a /usr/local/bin
RUN wget -q -O /usr/local/bin/cloudflared "https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSION}/cloudflared-linux-amd64" && \
    chmod +x /usr/local/bin/cloudflared

# 5. CONFIGURACIÓN FINAL DEL ENTORNO
RUN mkdir /scripts
WORKDIR /scripts

# Copiar archivos de código y definición de dependencias
COPY scripts/package*.json ./
RUN npm install --production
COPY scripts/ /scripts/

# 6. CONFIGURACIÓN DE INICIO
ENTRYPOINT ["/usr/local/bin/tini", "--"]
CMD ["tail", "-f", "/dev/null"]