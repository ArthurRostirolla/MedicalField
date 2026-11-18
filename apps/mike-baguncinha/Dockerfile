# Contexto de build: apps/mike-baguncinha
FROM golang:1.27 AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY cmd ./cmd
COPY internal ./internal
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /mike-baguncinha ./cmd/mike-baguncinha

# Imagem final: só o binário estático, usuário não-root (65532), nada para escrever em disco.
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /mike-baguncinha /mike-baguncinha
USER nonroot:nonroot
EXPOSE 8080 9090
ENTRYPOINT ["/mike-baguncinha"]
