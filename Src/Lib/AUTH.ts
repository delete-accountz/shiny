import {mkdir,readFile,rename,unlink,writeFile} from "node:fs/promises";
import path from "node:path";
import {randomUUID} from "node:crypto";
import bcrypt from "bcrypt";
import {query,withTransaction} from "./DB";

type User={id:string;username:string;email:string;passwordHash:string;createdAt:string;updatedAt?:string};
const defaultUsersPath=path.join(process.cwd(),"Storage","users.json");

function databaseMode(){return process.env.SHINY_STORAGE_MODE==="database"&&process.env.DATABASE_REQUIRED==="true";}

async function dbFindUserByEmail(email:string){
  const rows=await query<User>(`SELECT id,username,email,password_hash AS "passwordHash",created_at AS "createdAt",updated_at AS "updatedAt"
    FROM users WHERE lower(email)=lower($1) LIMIT 1`,[normalizeEmail(email)]);
  return rows[0]||null;
}
async function dbFindUserById(id:string){
  const rows=await query<User>(`SELECT id,username,email,password_hash AS "passwordHash",created_at AS "createdAt",updated_at AS "updatedAt"
    FROM users WHERE id=$1 LIMIT 1`,[id]);
  return rows[0]||null;
}
async function dbReadUsers(){
  return query<User>(`SELECT id,username,email,password_hash AS "passwordHash",created_at AS "createdAt",updated_at AS "updatedAt"
    FROM users ORDER BY created_at ASC`);
}
async function dbCreateUser(username:string,email:string,password:string){
  const normalizedUsername=normalizeUsername(username);
  const normalizedEmail=normalizeEmail(email);
  const passwordHash=await bcrypt.hash(password,12);
  try{
    return await withTransaction(async client=>{
      const id=randomUUID();
      const result=await client.query<User>(`INSERT INTO users(id,username,email,password_hash)
        VALUES($1,$2,$3,$4)
        RETURNING id,username,email,password_hash AS "passwordHash",created_at AS "createdAt",updated_at AS "updatedAt"`,
        [id,normalizedUsername,normalizedEmail,passwordHash]);
      return result.rows[0]||null;
    });
  }catch(error){
    if(error&&typeof error==="object"&&"code" in error&&(error as {code?:string}).code==="23505")return null;
    throw error;
  }
}

async function readFileUsers():Promise<User[]>{
  try{
    const parsed=JSON.parse(await readFile(defaultUsersPath,"utf8")) as unknown;
    if(!Array.isArray(parsed))throw new Error("users_storage_invalid");
    return parsed as User[];
  }catch(error){
    const code=error&&typeof error==="object"&&"code" in error?(error as {code?:string}).code:undefined;
    if(code!=="ENOENT")throw error;
    await atomicWrite(defaultUsersPath,"[]\n");return [];
  }
}
async function atomicWrite(filePath:string,content:string){
  await mkdir(path.dirname(filePath),{recursive:true});
  const temporary=filePath+"."+randomUUID()+".tmp";
  try{await writeFile(temporary,content,"utf8");await rename(temporary,filePath);}
  catch(error){await unlink(temporary).catch(()=>{});throw error;}
}
export function createUserStore(usersPath:string=defaultUsersPath){
  let usersChain:Promise<void>=Promise.resolve();
  async function readUsers():Promise<User[]>{
    try{
      const parsed=JSON.parse(await readFile(usersPath,"utf8")) as unknown;
      if(!Array.isArray(parsed))throw new Error("users_storage_invalid");
      return parsed as User[];
    }catch(error){
      const code=error&&typeof error==="object"&&"code" in error?(error as {code?:string}).code:undefined;
      if(code!=="ENOENT")throw error;
      await atomicWrite(usersPath,"[]\n");return [];
    }
  }
  async function saveUsers(users:User[]){await atomicWrite(usersPath,JSON.stringify(users,null,2)+"\n");}
  async function withUsersLock<T>(operation:()=>Promise<T>):Promise<T>{
    const previous=usersChain;let release!:()=>void;usersChain=new Promise(resolve=>{release=resolve});await previous;
    try{return await operation();}finally{release();}
  }
  async function createUser(username:string,email:string,password:string){
    return withUsersLock(async()=>{
      const users=await readUsers();const normalizedUsername=normalizeUsername(username);const normalizedEmail=normalizeEmail(email);
      if(users.some(user=>user.email===normalizedEmail)||users.some(user=>user.username.toLowerCase()===normalizedUsername.toLowerCase()))return null;
      const passwordHash=await bcrypt.hash(password,12);
      const user={id:randomUUID(),username:normalizedUsername,email:normalizedEmail,passwordHash,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
      await saveUsers([...users,user]);return user;
    });
  }
  async function findUserByEmail(email:string){const normalized=normalizeEmail(email);return (await readUsers()).find(user=>user.email===normalized)||null;}
  async function findUserById(id:string){return (await readUsers()).find(user=>user.id===id)||null;}
  return {readUsers,createUser,findUserByEmail,findUserById};
}

const defaultStore=createUserStore();
export async function readUsers(){return databaseMode()?dbReadUsers():defaultStore.readUsers();}
export async function findUserByEmail(email:string){return databaseMode()?dbFindUserByEmail(email):defaultStore.findUserByEmail(email);}
export async function findUserById(id:string){return databaseMode()?dbFindUserById(id):defaultStore.findUserById(id);}
export async function createUser(username:string,email:string,password:string){return databaseMode()?dbCreateUser(username,email,password):defaultStore.createUser(username,email,password);}
export function normalizeEmail(email:string){return email.trim().toLowerCase();}
export function normalizeUsername(username:string){return username.trim();}
export function passwordIsStrong(password:string){
  return password.length>=10&&password.length<=128&&/[a-z]/.test(password)&&/[A-Z]/.test(password)&&/[0-9]/.test(password)&&/[^A-Za-z0-9]/.test(password);
}
export async function verifyPassword(user:User,password:string){return bcrypt.compare(password,user.passwordHash);}
export type PublicUser=Pick<User,"id"|"username"|"email"|"createdAt">;
export function publicUser(user:User):PublicUser{const {passwordHash:_,...safe}=user;return safe;}
