FROM ubuntu:22.04
ENV DEBIAN_FRONTEND=noninteractive

#Instalar Munin, Nginx y Cronjob
RUN apt-get update && \
    apt-get install -y munin munin-node nginx curl cron && \
    rm -rf /var/lib/apt/lists/*

#Nginx conoce donde vive el hmtl de munin
RUN echo "server { listen 80; location / { root /var/cache/munin/www; index index.html; } }" > /etc/nginx/sites-available/default
#Inyecta sensor de Nestjs y le da permisos
COPY nestjs_app /etc/munin/plugins/nestjs_app
RUN chmod +x /etc/munin/plugins/nestjs_app

#Asegura los permisos del sistema
RUN mkdir -p /var/run/munin && chown -R munin:munin /var/run/munin

#Levantar todo y forzar el primer escaneo para no esperar 5 min
CMD service munin-node start && \
    service cron start && \
    su - munin --shell=/bin/bash -c "/usr/bin/munin-cron" && \
    nginx -g "daemon off;"