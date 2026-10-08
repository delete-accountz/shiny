# Plano de Incidente Financeiro

## Princípios

Nunca repetir cobrança automaticamente.
Nunca transformar timeout em FAILED.
Nunca alterar valor financeiro no client.
Nunca aceitar webhook sem HMAC válido.
Nunca resolver evento não associado como se fosse confirmado.
Nunca fazer rollback destrutivo do banco sem avaliar writes posteriores.

## Banco indisponível

1. Manter checkout fechado.
2. Não cobrar.
3. Não marcar webhook como processado.
4. Verificar Neon.
5. Recuperar em ambiente isolado.
6. Validar schema e dados.
7. Reconciliar PENDING depois da recuperação.

## Configuração ausente

Production retorna 503 production_configuration_incomplete.

Não adicionar fallback JSON.

Corrigir a variável no ambiente remoto e redeployar.

## Pagamento PENDING ou cobrança incerta

1. Não criar nova cobrança.
2. Marcar reconciliation_required.
3. Consultar Promisse somente se existir transactionId conhecido e as credenciais estiverem autorizadas.
4. Comparar transactionId, valor e estado.
5. Aplicar somente transições permitidas.
6. Escalar se o limite de tentativas for excedido.

## Webhook atrasado

1. Manter em pending_webhook_events.
2. Responder 202 quando não associado.
3. Não descartar.
4. Associar quando o payment correspondente existir.
5. Auditar a resolução.

## Webhook inválido

Assinatura inválida, payload inválido ou valor divergente não deve alterar estado financeiro.

Gerar registro/alerta operacional quando aplicável.

## Reconciliação esgotada

Gerar alerta CRITICAL.

Não converter automaticamente para FAILED apenas por esgotamento de tentativas.

Escalar para operador financeiro.

## Cron indisponível

Se Vercel Hobby não aceitar */5:

- usar plano compatível, ou
- usar scheduler externo autorizado.

O scheduler deve chamar /Api/Internal/Reconciliation com Authorization: Bearer <CRON_SECRET>.

Não colocar CRON_SECRET na URL.

## Alertas externos

O banco persiste operational_alerts.

Como nenhum destino externo foi escolhido nesta preparação, a configuração final deve:

1. escolher um destino corporativo;
2. armazenar a credencial fora do Git;
3. enviar somente eventos operacionais necessários;
4. não incluir API keys, Authorization headers ou payloads financeiros sensíveis;
5. testar com alerta sintético.

## Rollback de aplicação

1. Identificar deployment.
2. Suspender mutações se houver risco.
3. Promover deployment anterior.
4. Não desfazer pagamentos.
5. Reconciliar PENDING.
6. Verificar alertas.

## Rollback de migration

Preferir forward migration.

Não executar DROP ou DELETE destrutivo como rollback automático.

## Comunicação

Registrar UTC, incidente, deployment, banco, order/payment afetado, transactionId quando existente, decisão e responsável.

Nunca registrar secrets, cookies, Authorization headers ou connection strings.
