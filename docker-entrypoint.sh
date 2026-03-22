#!/bin/sh
# Railway injecte la variable PORT dynamiquement
# On remplace le placeholder dans la config nginx
PORT=${PORT:-80}
sed -i "s/PORT_PLACEHOLDER/$PORT/g" /etc/nginx/conf.d/default.conf

exec "$@"
