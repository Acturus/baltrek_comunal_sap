# Usa la imagen base de Ubuntu 18.04 LTS (Bionic Beaver)
FROM ubuntu:18.04

# Variables de entorno
ENV TINI_VERSION=v0.19.0
ENV DEBIAN_FRONTEND=noninteractive
ENV PYENV_ROOT=/opt/pyenv
ENV PATH=$PYENV_ROOT/bin:$PATH
ENV PATH=$PYENV_ROOT/shims:$PATH
# Versión de Python
ENV PYTHON_VER=3.10.12

# 1. INSTALACIÓN DE HERRAMIENTAS CRÍTICAS Y DEPENDENCIAS DE PYENV
# Estas dependencias son necesarias para que Pyenv compile Python.
RUN apt-get update && apt-get install -y \
    curl \
    netcat \
    build-essential \
    libssl-dev \
    zlib1g-dev \
    libbz2-dev \
    libreadline-dev \
    libsqlite3-dev \
    wget \
    llvm \
    libncurses5-dev \
    libncursesw5-dev \
    xz-utils \
    tk-dev \
    libffi-dev \
    liblzma-dev \
    git \
    && rm -rf /var/lib/apt/lists/*

# 2. INSTALAR TINI
# Instalación manual debido a problemas de repositorio.
RUN wget -q -O /usr/local/bin/tini https://github.com/krallin/tini/releases/download/${TINI_VERSION}/tini && \
    chmod +x /usr/local/bin/tini

# 3. INSTALAR PYENV Y PYTHON 3.10.12
# Clonar Pyenv y usarlo para compilar la versión específica.
RUN git clone https://github.com/pyenv/pyenv.git $PYENV_ROOT && \
    pyenv install ${PYTHON_VER} && \
    # Configurar Python 3.10.12 como la versión global
    pyenv global ${PYTHON_VER} && \
    pyenv rehash

# 4. CONFIGURACIÓN FINAL DEL ENTORNO
# Crear carpeta de scripts y configurar el directorio de trabajo
RUN mkdir /scripts
WORKDIR /scripts

# 5. CONFIGURACIÓN DE INICIO
# Tini (instalado en /usr/local/bin) es el ENTRYPOINT.
ENTRYPOINT ["/usr/local/bin/tini", "--"]
CMD ["tail", "-f", "/dev/null"]