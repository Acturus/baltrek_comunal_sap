# Usa la imagen base de Ubuntu 18.04 LTS (Bionic Beaver)
FROM ubuntu:18.04

# Variables de entorno
ENV TINI_VERSION=v0.19.0
ENV DEBIAN_FRONTEND=noninteractive

# 1. INSTALACIÓN DE HERRAMIENTAS CRÍTICAS Y DEPENDENCIAS
# Incluimos: build-essential, curl, netcat, nano, wget, y las herramientas de GPG.
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    netcat \
    build-essential \
    git \
    nano \
    && rm -rf /var/lib/apt/lists/*

# 2. INSTALAR NODE.JS 16 (Usando NodeSource PPA)
# a) Descargar e instalar la clave y el repositorio de NodeSource
RUN curl -fsSL https://deb.nodesource.com/setup_16.x | bash - && \
    # b) Instalar Node.js y npm
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# 4. INSTALAR TINI
RUN wget -q -O /usr/local/bin/tini https://github.com/krallin/tini/releases/download/${TINI_VERSION}/tini && \
    chmod +x /usr/local/bin/tini

# 5. CONFIGURACIÓN FINAL DEL ENTORNO
RUN mkdir /scripts
WORKDIR /scripts

# Copia los archivos de código y definición de dependencias
COPY scripts/ /scripts/

# Ejecuta la instalación de dependencias de Node.js
RUN npm install
RUN npm install -g pm2

# 6. CONFIGURACIÓN DE INICIO
ENTRYPOINT ["/usr/local/bin/tini", "--"]
CMD ["tail", "-f", "/dev/null"]