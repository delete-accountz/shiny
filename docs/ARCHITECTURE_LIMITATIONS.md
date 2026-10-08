# Limitações e estado arquitetural

## Arquitetura alvo

A produção financeira usa PostgreSQL compartilhado como fonte operacional. O caminho de produção exige:

- DATABASE_REQUIRED=true
- SHINY_STORAGE_MODE=database
- DATABASE_URL configurada no ambiente

Vercel não usa o filesystem local como armazenamento durável.

## Persistência

No modo database, usuários, sessões, revogações, CSRF, rate limit, produtos, inventário, pedidos, pagamentos, cupons, reservas, webhook events, eventos pendentes, reconciliação, auditoria, analytics, suporte, posts, FAQ e configurações de webhook usam PostgreSQL.

Os adapters JSON continuam apenas para compatibilidade de testes/legado. O proxy de produção falha fechado se o modo database não estiver configurado.

## Concorrência

Estoque e cupons usam transações PostgreSQL e locks de linha.

Eventos financeiros e reconciliação usam advisory locks transacionais.

O teste de concorrência com duas conexões reais foi criado em tests/db-concurrency.cjs, mas não foi executado porque a máquina local não possui PostgreSQL, psql, Docker, Podman ou distribuição WSL instalada, e nenhum banco de teste remoto foi configurado.

## Segurança

Sessões e estado de segurança possuem caminho compartilhado no PostgreSQL.

Tokens continuam assinados com HMAC e comparados com timing-safe comparison. Segredos de sessão e criptografia de webhooks são separados.

Webhook Promisse:

1. limita o corpo;
2. preserva o corpo bruto;
3. calcula SHA-256 do corpo;
4. valida HMAC antes do parse;
5. valida evento e data.id;
6. persiste evento único;
7. usa valor financeiro em centavos;
8. bloqueia downgrade de PAID;
9. eventos sem associação permanecem pendentes e retornam 202.

## Reconciliação

A reconciliação possui estado persistente, claims, advisory lock, tentativas, backoff, limite máximo e alertas.

A chamada externa ocorre fora da transação de banco.

Erros de rede e timeout não transformam pagamento em FAILED.

Ainda existe uma lacuna operacional: eventos pendentes sem associação precisam de worker específico para consultar/associar a transação sem depender de uma ordem já existente.

## Backup e recuperação

O runbook foi definido, mas backup real do Neon e restore real ainda não foram executados porque nenhum projeto Neon remoto foi criado.

## Vercel

A configuração local usa região Vercel gru1, correspondente à região AWS São Paulo, e timeouts explícitos nas funções financeiras.

Cron de reconciliação está declarado em vercel.json, mas a automação está desativada até a configuração operacional remota.

## Estado remoto

Nenhum projeto Neon remoto foi criado.

Nenhum projeto Vercel foi conectado ou publicado.

A máquina remota não possui credenciais Neon/Vercel disponibilizadas ao processo e nenhum login foi realizado.

## Conclusão

A base local de produção compila e os regressivos P0/P1/P2-A passam. A aplicação ainda não pode ser declarada pronta para cobrança real enquanto banco remoto, Vercel, backup/restore e concorrência em banco real não forem efetivamente validados.
