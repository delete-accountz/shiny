# PostgreSQL / Neon migration

## Estado desta etapa

A aplicação possui uma camada PostgreSQL compatível com Neon/Vercel, mas a migração operacional completa ainda não está concluída.

Produção deve usar exclusivamente:

- DATABASE_REQUIRED=true
- SHINY_STORAGE_MODE=database
- DATABASE_URL configurada no ambiente de execução

Se a configuração estiver ausente, o proxy falha fechado. Não existe fallback silencioso para Storage/*.json no caminho de produção.

## Driver

- @neondatabase/serverless 1.2.0
- SQL explícito; sem ORM
- Pool curto por instância serverless
- transações curtas
- SELECT ... FOR UPDATE para estoque/cupons
- pg_try_advisory_xact_lock para serialização de reconciliação/eventos quando aplicável

A dependência foi instalada sem criar lockfile nesta etapa, conforme autorização.

## Migrations

Arquivos em migrations/:

- 001_initial.sql — entidades financeiras, usuários, sessões, produtos, inventário, cupons, pedidos, pagamentos, webhooks, reconciliação, auditoria, analytics, suporte, posts e FAQs.
- 002_security_state.sql — CSRF persistente, rate-limit buckets e registros de idempotência.

O script scripts/db-migrate.mjs não carrega .env.local. Ele exige DATABASE_URL já fornecida pelo processo e exige explicitamente o modo database.

Nenhuma migration foi executada contra Neon ou qualquer banco remoto nesta etapa.

## Dinheiro e cupons

Valores monetários financeiros são armazenados em centavos.

Para preservar o contrato atual do cupom:

- cupom fixed: value armazenado em centavos;
- cupom percent: value armazenado em basis points (10000 = 100%).

O checkout em modo database recalcula produto, estoque e desconto no banco e cria PENDING order/payment dentro de uma transação curta.

A chamada Promisse deve ocorrer somente depois do COMMIT.

## Estoque

No checkout:

- available_quantity diminui;
- reserved_quantity aumenta.

PAID:

- reserved diminui;
- consumed aumenta.

FAILED/CANCELLED/EXPIRED:

- reserved diminui;
- available aumenta.

As operações usam locks transacionais e constraints que impedem estoque negativo.

## Webhook

Eventos associados são persistidos em webhook_events com event_id único.

Eventos ainda sem associação são persistidos em pending_webhook_events e permanecem disponíveis para reconciliação.

Evento duplicado não reaplica a transição.

Downgrade de PAID é bloqueado.

## Auditoria

Quando database=true, audit_events é a fonte operacional. O audit.log histórico de M11 não é apagado.

Falha de auditoria secundária não deve alterar o estado financeiro.

## Migração de dados reais

Ainda não executar.

O fluxo futuro deve ser:

1. dry-run;
2. validação estrutural;
3. contagem por entidade;
4. detecção de duplicidade;
5. relatório;
6. backup;
7. confirmação explícita;
8. importação controlada;
9. verificação pós-importação;
10. rollback se necessário.

.env.local nunca deve ser copiado para migration, backup ou artefato.

## Backup / restore / rollback

Antes da entrada financeira real:

- configurar backup automático do provedor;
- definir retenção;
- criptografia;
- RPO/RTO;
- restaurar em ambiente separado;
- executar teste de restore;
- documentar rollback de aplicação;
- documentar rollback/forward-fix de migration;
- definir procedimento para pagamento PENDING e webhook atrasado.

Uma migration irreversível não deve ser tratada como rollback automático; usar migration corretiva/forward migration.

## Vercel

Ainda não configurada nesta etapa.

Quando autorizada:

- Production e Preview separados;
- DATABASE_URL por ambiente;
- sem filesystem persistente;
- sem Storage/Logs/.env.local/.next/cache no artefato;
- webhook com resposta rápida;
- cron de reconciliação somente após desenho final e autenticação do endpoint.

## Promisse

Nenhuma chamada real foi feita.

Testes devem usar mock.

Não inventar sandbox, idempotency key, cancelamento, reembolso ou estados oficiais não documentados.

## Critério de produção financeira

Apenas considerar pronto depois de:

- migration remota aplicada;
- backup e restore testados;
- checkout DB completo;
- concorrência real testada em banco;
- webhook persistido;
- reconciliação persistida com tentativas/backoff;
- rate limit compartilhado;
- sessões compartilhadas;
- dashboard financeiro DB;
- alertas;
- lockfile e audit;
- Preview validado;
- artefato sem secrets/cache;
- plano de incidente aprovado.
