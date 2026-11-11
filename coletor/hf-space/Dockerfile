# Coletor do Prospecta na nuvem (Hugging Face Spaces, grátis): mesma imagem do Google Maps usada no PC + Node.
FROM gosom/google-maps-scraper:v1.18.0@sha256:09ba6c2c74ca5dd063c370fd17e2d3da91cc8b1c50172093bdb62268d5c57ddb
USER root
COPY --from=node:20-bookworm-slim /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
COPY server.mjs hardening.mjs ./coletor/
RUN mkdir -p /app/coletor/saida/cache && chmod -R a+rwX /app /opt
ENV COLETOR_HOST=0.0.0.0 COLETOR_PORT=7860 COLETOR_MODO=completo COLETOR_BIN=google-maps-scraper HOME=/tmp
USER 1000
EXPOSE 7860
ENTRYPOINT []
CMD ["node", "coletor/server.mjs"]
