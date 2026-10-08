[Reading 54 lines from start (total: 54 lines, 0 remaining)]

# Integração PromissePay

Fonte do contrato: documentação oficial da PromissePay em https://promisse.com.br/docs, consultada em 2026-10-07.

## Matriz confirmada
- Endpoint oficial de criação: https://api.promisse.com.br/transactions
- Método: POST
- URL base: https://api.promisse.com.br
- Autenticação: header Authorization com a chave crua, sem Bearer
- Headers: Authorization e Content-Type: application/json
- Payload confirmado: amount obrigatório em centavos; webhook opcional; split_email e split_tax existem para split, mas não são usados pelo checkout
- Campos obrigatórios: amount
- Resposta confirmada: HTTP 201 com status, id, amount, qrCodeBase64, copyPaste e opcionalmente expiresAt, fee, storeId
- ID da transação: id
- Estado inicial documentado: pending
- Estado de pagamento confirmado: PAID na consulta e evento payment.approved
- Falha/expiração: evento payment.failed
- Consulta server-side: GET /transactions/:id
- Listagem administrativa documentada: GET /transactions (escopo payments.read); não é usada pelo checkout público
- Webhook: POST JSON com envelope event, data, timestamp
- Eventos relevantes: payment.approved e payment.failed
- Assinatura: header promisse-signature, HMAC SHA-256 do corpo bruto, formato sha256=<hex>
- Header promisse-webhook-secret: existe na documentação, mas a aplicação usa exclusivamente HMAC para autenticação do webhook
- Timestamp: presente no envelope, mas a documentação não define janela de tolerância/replay por timestamp
- Event ID: não é documentado; a documentação determina tratamento idempotente usando data.id
- Idempotência de criação: NÃO documentada para POST /transactions; a aplicação usa uma chave de idempotência local para impedir duplicação de pedidos, mas não envia uma chave inventada à Promisse
- Sandbox: não informado na documentação consultada
- Produção: documentada com chave sk_live_...
- Cancelamento: não documentado para cobranças PIX
- Reembolso: não documentado como operação de cobrança; transfer-refunded é um evento de saque, não um endpoint de reembolso do checkout
- Retry: a Promisse documenta GET /transactions/:id como reconciliação; por ausência de idempotência documentada no POST, o checkout não repete automaticamente uma criação cujo resultado ficou incerto

## Mapeamento local de estados
- **PENDING** -> Promisse `pending` durante a criação/consulta e enquanto não houver confirmação.
- **PAID** -> Promisse `PAID` em consulta ou evento `payment.approved`.
- **FAILED** -> evento Promisse `payment.failed`; a documentação informa que esse evento cobre cobrança recusada ou cobrança expirada sem pagamento.
- **CANCELLED** -> estado comercial local terminal; não existe contrato documentado de cancelamento de cobrança PIX usado pela aplicação.
- **EXPIRED** -> estado comercial local terminal disponível no modelo; não é inferido automaticamente a partir de `expiresAt`. O frontend usa `expiresAt` somente como sinal visual e, quando vencido, marca o pedido para reconciliação.
- Não existem estados financeiros Promisse inventados além de `pending`, `PAID` e do evento `payment.failed`.

## Reconciliação server-side
- O pedido autenticado pode solicitar uma reconciliação manual pela rota local `/Api/Orders/[id]/Reconcile`; a Promisse é consultada somente no servidor com `GET /transactions/:id`.
- A chamada usa `Authorization` com a chave crua, timeout de 5 segundos, rate limit por pedido e validação do ID, valor, `type` quando presente e status documentados.
- `pending` mantém o pedido em `PENDING`; `PAID` pode promover `PENDING` para `PAID`.
- Erros de rede, timeout, 401, 403, 429 e 5xx não convertem o pedido em `FAILED`.
- A rotina operacional de OWNER reconcilia no máximo 10 pedidos por execução e não existe polling contínuo no frontend.

## Expiração e abandono
- `expiresAt` é usado para UX quando retornado pela Promisse; seu vencimento não é tratado sozinho como confirmação de falha financeira.
- Um `PENDING` antigo ou visualmente expirado é classificado como **reconciliação necessária**. A reserva de estoque e a reserva de cupom permanecem lógicas enquanto o pedido continuar `PENDING`.
- Não há liberação automática de reserva baseada apenas em `expiresAt`.
- Um `PENDING` sem `transactionId` continua sendo um resultado incerto e não gera nova cobrança automática.

## Consulta do próprio pedido
- `GET /Api/Orders` e `GET /Api/Orders/[id]` exigem sessão HMAC de usuário.
- O `userId` é derivado exclusivamente da sessão; um ID de pedido pertencente a outra conta retorna `404` indistinguível de inexistente.
- A resposta pública contém somente os campos necessários do próprio pedido. O `transactionId` é mascarado; QR/copia-e-cola só aparecem enquanto o pedido continua apto para UX de `PENDING`.
- `/Api/Payment/[Id]` permanece separado e restrito a OWNER.

## Segurança aplicada
- Checkout exige sessão de usuário, CSRF e rate limit.
- Preço, estoque, cupom e total são recalculados no servidor.
- O valor enviado à Promisse é convertido para centavos no servidor.
- A resposta da Promisse é validada, inclusive ID, status, amount, QR e copy-paste.
- A consulta de pagamento continua restrita a OWNER.
- O header Authorization da consulta usa a chave crua, conforme contrato oficial.
- O webhook valida HMAC sobre os bytes brutos com comparação timing-safe.
- Eventos duplicados são ignorados por chave event:data.id.
- Eventos desconhecidos são aceitos sem alteração de pedido.
- Divergência de valor no webhook é rejeitada.
- Nenhum secret é enviado ao client ou escrito em logs.

## Variáveis necessárias
Somente os nomes abaixo foram adicionados a .env.example; nenhum valor foi colocado em .env.local:
- PROMISSE_API_KEY
- PROMISSE_API_BASE_URL
- PROMISSE_WEBHOOK_URL
- PROMISSE_WEBHOOK_SECRET
A secret do webhook deve ser obtida no cadastro do webhook da Promisse e permanecer somente no servidor.

## Integridade P0 do checkout
- **Estoque:** a fonte persistida de catálogo é `Storage/products.json`. O estoque disponível é calculado considerando quantidades de pedidos `PENDING` (reserva) e `PAID` (consumo). `FAILED` e `CANCELLED` deixam de reservar estoque. A reserva é criada junto do pedido antes do POST à Promisse; falha de pagamento libera a reserva logicamente sem decrementar produto. Não há decremento físico prematuro.
- **Cupom:** estratégia escolhida: **reserva no checkout e consumo definitivo somente após `payment.approved`**. Um pedido `PENDING` reserva uma vaga do `usageLimit`; `payment.failed` libera a vaga; aprovação incrementa `usedCount` uma única vez por pedido. Webhooks duplicados são idempotentes.
- **Webhooks precoces:** se `payment.approved`/`payment.failed` chegar antes da associação local do `transactionId`, o evento assinado é persistido em `Storage/promisse-pending-webhooks.json` e respondido com `202`. Após a resposta de criação, a associação local é persistida e o evento pendente é reconciliado por `data.id`.
- **Falha de auditoria:** auditoria é telemetria secundária. Depois de persistir o `transactionId`, falha de `audit()` não altera o resultado financeiro nem induz nova cobrança; uma trilha secundária de falha de auditoria é tentada sem lançar exceção.
- **Resultado incerto:** timeout/falha de persistência antes da associação do `transactionId` não gera retry automático do POST. O pedido permanece sem nova tentativa automática.
- **Catálogo:** `Storage/products.json` é a fonte oficial. Arquivo ausente e arquivo vazio significam catálogo vazio; não existe fallback silencioso para `Src/Lib/PRODUCTS.ts`.

## Limitações não inventadas
A documentação oficial consultada não fornece contrato para sandbox, idempotency key no POST, cancelamento ou reembolso de cobranças. Esses recursos não foram simulados nem adicionados por suposição.

### Limitação de concorrência do filesystem
Os locks usados pelo armazenamento JSON são locks em processo. Eles protegem concorrência entre requisições dentro da mesma instância do processo, mas não fornecem coordenação distribuída entre múltiplos processos/instâncias. Portanto, a garantia de estoque/cupom implementada nesta etapa não deve ser interpretada como uma garantia transacional de múltiplas instâncias; uma implantação horizontal exige um mecanismo de armazenamento transacional/lock distribuído antes de considerar essa parte totalmente escalável.

[executed on device: WIN-QT8G3EHPOS9 (3b198560-0113-47af-b113-7c575b093b73)]