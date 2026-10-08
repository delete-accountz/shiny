# Security

## Secrets

Nunca versionar `.env.local`, `.env`, chaves Promisse, segredo HMAC, chave administrativa, segredo hCaptcha, certificados privados, dumps ou backups.

O único arquivo de ambiente versionável é `.env.example`, contendo placeholders.

## Client boundary

`NEXT_PUBLIC_HCAPTCHA_SITE_KEY` é público e usado pelo componente client.

As seguintes classes são server-only: Promisse, ADMIN, HCAPTCHA secret, proxy trust e storage mode.

Nenhum secret deve ser colocado em props serializadas, HTML ou bundle client.

## Promisse

A chave Promisse é lida somente por rotas/server libraries. A consulta usa `Authorization` sem `Bearer`, conforme o contrato confirmado anteriormente.

Não executar cobrança real durante testes desta etapa.

## Webhook

O endpoint valida HMAC-SHA256 sobre o corpo bruto antes de processar o evento. Eventos não associados são persistidos para reconciliação no Storage atual.

Essa persistência é o motivo pelo qual o webhook não está aprovado para produção serverless.

## CSRF / sessões / rate limits

As proteções P0/P1/P2-A são preservadas. Entretanto, parte delas usa memória de processo e/ou filesystem local. Isso limita o modelo atual a single-process.

## Logs

Logs locais não devem ser enviados ao GitHub nem tratados como mecanismo de observabilidade em produção distribuída. Em Vercel, usar os mecanismos de observabilidade da plataforma ou serviço centralizado.

## GitHub

Recomenda-se habilitar Secret Scanning e Push Protection. Push Protection é uma barreira preventiva: o GitHub pode bloquear um push contendo uma credencial suportada antes que ela chegue ao repositório.

Também habilitar Dependabot alerts, Dependabot security updates, branch protection e revisão obrigatória.

## Incidente

Se uma credencial real for encontrada:
1. não imprimir a credencial;
2. interromper o deploy;
3. revogar/rotacionar a credencial;
4. remover o segredo dos arquivos;
5. verificar histórico Git;
6. investigar logs/artefatos;
7. somente então prosseguir.

## Cache

`.next/cache` é descartável e pode conter snapshots de ambiente de build. A auditoria P2-D encontrou material com aparência de chave live nesse cache. Por isso o cache nunca deve ser publicado ou empacotado.

## Testes

Testes de regressão devem usar mocks e diretórios temporários. Não usar usuários, pedidos, cupons, produtos, News ou pagamentos reais.
