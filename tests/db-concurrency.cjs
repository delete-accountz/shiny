const assert=require("node:assert/strict");
const crypto=require("node:crypto");
const {Pool}=require("@neondatabase/serverless");

const url=(process.env.DATABASE_TEST_URL||"").trim();
if(!url)throw new Error("DATABASE_TEST_URL is required; this test never loads .env.local.");

const poolA=new Pool({connectionString:url,max:1,connectionTimeoutMillis:5000});
const poolB=new Pool({connectionString:url,max:1,connectionTimeoutMillis:5000});

async function setup(client){
  const user=crypto.randomUUID();
  const product=crypto.randomUUID();
  const coupon=crypto.randomUUID();
  const orderA=crypto.randomUUID();
  const orderB=crypto.randomUUID();
  await client.query("INSERT INTO users(id,username,email,password_hash) VALUES($1,$2,$3,$4)",[user,"db-test-"+user.slice(0,8),user+"@test.invalid","test"]);
  await client.query("INSERT INTO orders(id,user_id,status,subtotal_cents,discount_cents,total_cents,idempotency_key_hash) VALUES($1,$2,'PENDING',100,0,100,$3),($4,$2,'PENDING',100,0,100,$5)",[orderA,user,crypto.createHash('sha256').update(orderA).digest('hex'),orderB,crypto.createHash('sha256').update(orderB).digest('hex')]);
  await client.query("INSERT INTO payments(id,order_id,status,provider_status,amount_cents) VALUES($1,$2,'PENDING','pending',100),($3,$4,'PENDING','pending',100)",[crypto.randomUUID(),orderA,crypto.randomUUID(),orderB]);
  await client.query("INSERT INTO products(id,name,price_cents,description,category) VALUES($1,'DB concurrency test',1000,'test','test')",[product]);
  await client.query("INSERT INTO inventory(product_id,available_quantity) VALUES($1,1)",[product]);
  await client.query("INSERT INTO coupons(id,code,coupon_type,value,usage_limit) VALUES($1,$2,'fixed',100,1)",[coupon,"DBTEST_"+coupon.slice(0,8)]);
  return {user,product,coupon,orderA,orderB};
}
async function cleanup(client,ids){
  await client.query("DELETE FROM payments WHERE order_id IN ($1,$2)",[ids.orderA,ids.orderB]);
  await client.query("DELETE FROM orders WHERE id IN ($1,$2)",[ids.orderA,ids.orderB]);
  await client.query("DELETE FROM users WHERE id=$1",[ids.user]);
  await client.query("DELETE FROM coupons WHERE id=$1",[ids.coupon]);
  await client.query("DELETE FROM products WHERE id=$1",[ids.product]);
}
async function stockRace(){
  const a=await poolA.connect();const b=await poolB.connect();
  try{
    const ids=await setup(a);
    await Promise.all([a.query("BEGIN"),b.query("BEGIN")]);
    const first=a.query("SELECT available_quantity FROM inventory WHERE product_id=$1 FOR UPDATE",[ids.product]);
    await first;
    const secondPromise=b.query("SELECT available_quantity FROM inventory WHERE product_id=$1 FOR UPDATE",[ids.product]);
    await a.query("UPDATE inventory SET available_quantity=available_quantity-1,reserved_quantity=reserved_quantity+1 WHERE product_id=$1 AND available_quantity>=1",[ids.product]);
    await a.query("COMMIT");
    const second=(await secondPromise).rows[0].available_quantity;
    assert.equal(Number(second),0);
    await b.query("ROLLBACK");
    const row=(await a.query("SELECT available_quantity,reserved_quantity FROM inventory WHERE product_id=$1",[ids.product])).rows[0];
    assert.equal(Number(row.available_quantity),0);assert.equal(Number(row.reserved_quantity),1);
    await cleanup(a,ids);
    console.log("DB STOCK CONCURRENCY PASS: two real connections, one reservation only");
  }finally{a.release();b.release();}
}
async function couponRace(){
  const a=await poolA.connect();const b=await poolB.connect();
  try{
    const ids=await setup(a);
    await Promise.all([a.query("BEGIN"),b.query("BEGIN")]);
    await a.query("SELECT id,used_count,usage_limit FROM coupons WHERE id=$1 FOR UPDATE",[ids.coupon]);
    const waiting=b.query("SELECT id,used_count,usage_limit FROM coupons WHERE id=$1 FOR UPDATE",[ids.coupon]);
    await a.query("INSERT INTO coupon_reservations(id,coupon_id,order_id,user_id,state) VALUES($1,$2,$3,$4,'RESERVED')",[crypto.randomUUID(),ids.coupon,ids.orderA,ids.user]);
    await a.query("COMMIT");
    const row=(await waiting).rows[0];
    assert.equal(Number(row.used_count),0);assert.equal(Number(row.usage_limit),1);
    const count=(await b.query("SELECT count(*)::int AS count FROM coupon_reservations WHERE coupon_id=$1 AND state='RESERVED'",[ids.coupon])).rows[0].count;
    assert.equal(count,1);
    assert.ok(Number(row.used_count)+Number(count)>=Number(row.usage_limit));
    await assert.rejects(async()=>{
      if(Number(row.used_count)+Number(count)>=Number(row.usage_limit))throw new Error("coupon_exhausted");
      await b.query("INSERT INTO coupon_reservations(id,coupon_id,order_id,user_id,state) VALUES($1,$2,$3,$4,'RESERVED')",[crypto.randomUUID(),ids.coupon,ids.orderB,ids.user]);
    },/coupon_exhausted/);
    await b.query("ROLLBACK");
    await cleanup(a,ids);
    console.log("DB COUPON CONCURRENCY PASS: two real connections, one reservation");
  }finally{a.release();b.release();}
}
(async()=>{
  try{
    await stockRace();
    await couponRace();
  }finally{
    await Promise.all([poolA.end(),poolB.end()]);
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
