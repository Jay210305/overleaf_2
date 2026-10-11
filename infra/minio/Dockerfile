FROM golang:1.26-alpine@sha256:3082400e369fa24d5fc60bca20edab3f6d604e0c5a690ec66b295eff4dd87ade AS build
RUN CGO_ENABLED=0 GOBIN=/out go install github.com/minio/minio@7aac2a2c5b7c
FROM alpine:3.23@sha256:85fe1e81d6758c208f3e1eed4338a1997e19d4be002d4dd32d3100c9a8c010a0
RUN apk add --no-cache ca-certificates && adduser -D -u 10001 minio && mkdir /data && chown minio /data
COPY --from=build /out/minio /usr/local/bin/minio
COPY --from=build /go/pkg/mod/github.com/minio/minio@v0.0.0-20260212201848-7aac2a2c5b7c/LICENSE /usr/share/licenses/minio/LICENSE
USER 10001
EXPOSE 9000 9001
ENTRYPOINT ["minio"]
