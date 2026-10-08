# Backup, Restore, RPO e RTO

## Estado atual

Projeto Neon: shiny-store-prod
Região: AWS South America East 1 / aws-sa-east-1
PostgreSQL: 17

Já validado:

- migrations 001–005 aplicadas;
- schema_migrations validado;
- 27 tabelas públicas;
- snapshot manual post-migration-history;
- restore real para branch isolado;
- restore validou 27 tabelas e 5 migrations;
- branches de teste removidos.

O agendamento automático de snapshots não foi habilitado porque o projeto respondeu que a criação de backup schedule não está habilitada. Portanto, backup automático recorrente continua como gate operacional.

## Como configurar quando o recurso estiver disponível

1. Abrir o projeto Production no Neon.
2. Abrir a área de backups/snapshots do projeto.
3. Habilitar a política automática disponível para o plano.
4. Definir retenção compatível com a política financeira da aplicação.
5. Registrar data/hora da primeira execução confirmada.
6. Executar um restore em branch isolado.
7. Validar schema_migrations, constraints, orders, payments, inventory, coupon_reservations, webhook_events e reconciliation_attempts.
8. Registrar o resultado e remover o branch de teste conforme política.

Não declarar backup automático como PASS enquanto uma execução agendada real não estiver confirmada.

## DATABASE_URL

Production deve usar a connection string do projeto/branch Production.

Preview deve preferir branch separado.

Nunca publicar a connection string em Git ou documentação e nunca usar vercel env pull neste projeto.

## RPO

Metas:

- financeiro: <= 5 minutos;
- não financeiro: <= 15 minutos.

As metas somente podem ser marcadas como atendidas depois que a política de backup correspondente estiver habilitada e testada.

## RTO

Metas:

- checkout/webhook: <= 30 minutos;
- administrativo: <= 2 horas.

O restore real já foi validado em branch isolado, mas promoção Production continua condicionada aos gates restantes.

## Restore

Procedimento:

1. interromper ou restringir mutações se houver risco;
2. criar branch isolado;
3. restaurar o ponto escolhido;
4. validar schema_migrations;
5. validar constraints e FKs;
6. validar orders/payments;
7. validar inventory/reservations;
8. validar coupons;
9. validar webhooks;
10. validar reconciliation_attempts;
11. executar smoke tests;
12. somente depois avaliar promoção.

Nunca restaurar destrutivamente por impulso quando existem writes financeiros posteriores.

## Rollback de aplicação

Promover deployment anterior.

Não desfazer pagamentos por rollback de código.

Depois:

- consultar PENDING;
- processar/reconciliar pendências;
- verificar alertas;
- registrar incidente.

## Rollback de migration

Preferir forward migration corretiva.

Migration destrutiva exige snapshot/restore validado, revisão e janela operacional.

## Incidente financeiro

Nunca repetir cobrança automaticamente.

Se uma cobrança estiver incerta, reconciliar pelo transactionId conhecido.

Se não houver transactionId, não inventar endpoint de descoberta.

Webhook não associado deve permanecer pendente.

Divergência de valor deve ser rejeitada e gerar alerta CRITICAL.
