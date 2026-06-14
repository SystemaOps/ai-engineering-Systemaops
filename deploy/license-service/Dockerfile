# License service — Node stdlib only, no dependencies to install.
FROM node:20-alpine
WORKDIR /app
COPY server.js keygen.js ./
USER node
EXPOSE 8787
CMD ["node", "server.js"]
