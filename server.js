require("dotenv").config();
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");
const path = require("path");
const app = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL === "true" ? {rejectUnauthorized:false} : undefined });
const port = Number(process.env.PORT || 3000);
app.use(express.json({limit:"5mb"}));
app.use(session({name:"smart_society.sid",secret:process.env.SESSION_SECRET || "replace-this-secret",resave:false,saveUninitialized:false,cookie:{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:8*60*60*1000}}));
const run = fn => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next);
const userShape = u => u ? {role:u.role,name:u.name,address:u.address||"",phone:u.phone||"",staffId:u.staff_id||""} : null;
const complaintShape = r => ({id:r.id,cat:r.category,category:r.category,address:r.address,title:r.title,details:r.details,status:r.status,urgency:r.urgency,note:r.note,ts:Number(r.created_at),updatedTs:Number(r.updated_at),resident:r.resident_name,photoData:r.photo_data||""});
const serviceShape = r => ({id:r.id,serviceId:r.service_id,name:r.name,category:r.category,status:r.status,note:r.note,addedAt:Number(r.added_at),updatedAt:Number(r.updated_at),addedBy:r.added_by,address:r.address});
function signedIn(req,res,next){if(!req.session.user)return res.status(401).json({ok:false,error:"Please sign in."});next();}
function staffOnly(req,res,next){if(!req.session.user)return res.status(401).json({ok:false,error:"Please sign in."});if(req.session.user.role!=="admin")return res.status(403).json({ok:false,error:"Staff only."});next();}

async function init(){
 await pool.query(`
 CREATE TABLE IF NOT EXISTS society_users(
  id SERIAL PRIMARY KEY, role VARCHAR(12) NOT NULL CHECK(role IN ('resident','admin')),
  name VARCHAR(120) NOT NULL,address VARCHAR(180),phone VARCHAR(30) DEFAULT '',
  staff_id VARCHAR(30),password_hash TEXT NOT NULL,created_at TIMESTAMPTZ DEFAULT NOW());
 CREATE UNIQUE INDEX IF NOT EXISTS society_address_unique ON society_users(LOWER(address)) WHERE address IS NOT NULL;
 CREATE UNIQUE INDEX IF NOT EXISTS society_staff_unique ON society_users(LOWER(staff_id)) WHERE staff_id IS NOT NULL;
 CREATE TABLE IF NOT EXISTS complaints(
  id VARCHAR(24) PRIMARY KEY,category VARCHAR(50) NOT NULL,address VARCHAR(180) NOT NULL,
  title VARCHAR(180) NOT NULL,details TEXT DEFAULT '',status VARCHAR(20) DEFAULT 'Pending',
  urgency VARCHAR(12) DEFAULT 'Medium',note TEXT DEFAULT '',resident_name VARCHAR(120) NOT NULL,
  created_at BIGINT NOT NULL,updated_at BIGINT NOT NULL,photo_data TEXT DEFAULT '');
 CREATE TABLE IF NOT EXISTS service_requests(
  id VARCHAR(40) PRIMARY KEY,service_id VARCHAR(40) NOT NULL,name VARCHAR(80) NOT NULL,
  category VARCHAR(80) NOT NULL,status VARCHAR(20) DEFAULT 'Requested',note TEXT DEFAULT '',
  added_at BIGINT NOT NULL,updated_at BIGINT NOT NULL,added_by VARCHAR(120) NOT NULL,address VARCHAR(180) NOT NULL,
  UNIQUE(address,service_id));
 ALTER TABLE complaints ADD COLUMN IF NOT EXISTS photo_data TEXT DEFAULT '';
 ALTER TABLE service_requests DROP CONSTRAINT IF EXISTS service_requests_address_service_id_key;`);
 let r=await pool.query("SELECT id FROM society_users WHERE role='admin' LIMIT 1");
 if(!r.rowCount) await pool.query("INSERT INTO society_users(role,name,staff_id,password_hash) VALUES('admin',$1,$2,$3)",["RWA Admin","RWA-01",await bcrypt.hash("admin1234",10)]);
 r=await pool.query("SELECT id FROM society_users WHERE LOWER(address)=LOWER($1)",["B-10, Mayfield Gardens"]);
 if(!r.rowCount) await pool.query("INSERT INTO society_users(role,name,address,phone,password_hash) VALUES('resident',$1,$2,'',$3)",["Demo Resident B-10","B-10, Mayfield Gardens",await bcrypt.hash("demo1234",10)]);
 r=await pool.query("SELECT COUNT(*)::int n FROM complaints");
 if(!r.rows[0].n){
  const now=Date.now(),day=86400000;
  const rows=[
   ["MG-B-0146","Water","B-10, Mayfield Gardens","No water supply on 3rd floor since morning","In progress","High",0,"Booster pump valve being replaced.","Demo Resident B-10"],
   ["MG-B-0145","Maintenance","B-702, Mayfield Gardens","Lift stops between 6th and 7th floor","Pending","High",1,"","Demo Resident B-702"],
   ["MG-B-0144","Cleanliness","B-108, Mayfield Gardens","Garbage not collected from basement bay","Pending","Medium",1,"","Demo Resident B-108"],
   ["MG-B-0143","Electricity","B-10, Mayfield Gardens","Corridor lights out on 3rd floor","In progress","Medium",2,"Two fittings replaced, third on order.","Demo Resident B-10"],
   ["MG-B-0142","Other","B-201, Mayfield Gardens","Visitor car parked in allotted slot 14","Resolved","Low",3,"Vehicle moved, sticker rule shared with owner.","Demo Resident B-201"],
   ["MG-B-0140","Security","B-609, Mayfield Gardens","Intercom not connecting to guard room","Resolved","Medium",6,"Line re-terminated at the DP box.","Demo Resident B-609"],
   ["MG-B-0139","Water","B-10, Mayfield Gardens","Leaking tap in the kitchen","Resolved","Low",8,"Washer changed.","Demo Resident B-10"]];
  for(const c of rows) await pool.query("INSERT INTO complaints(id,category,address,title,status,urgency,note,resident_name,details,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'',$9,$9) ON CONFLICT DO NOTHING",[c[0],c[1],c[2],c[3],c[4],c[5],c[7],c[8],now-c[6]*day]);
 }
 r=await pool.query("SELECT COUNT(*)::int n FROM service_requests");
 if(!r.rows[0].n){const now=Date.now();await pool.query("INSERT INTO service_requests(id,service_id,name,category,status,note,added_at,updated_at,added_by,address) VALUES('s1','gardening','Gardening','Maintenance','Requested','',$1,$1,'Demo Resident B-10','B-10, Mayfield Gardens'),('s2','plumbing','Plumbing','Water','In progress','Plumber visiting tomorrow.',$2,$1,'Demo Resident B-702','B-702, Mayfield Gardens')",[now-86400000,now-2*86400000]);}
}
app.get("/api/health",(req,res)=>res.json({ok:true}));
app.get("/api/auth/me",run(async(req,res)=>{if(!req.session.user)return res.json({ok:true,user:null});const r=await pool.query("SELECT * FROM society_users WHERE id=$1",[req.session.user.id]);res.json({ok:true,user:userShape(r.rows[0])});}));
app.post("/api/auth/login",run(async(req,res)=>{const {role,identifier,password}=req.body||{};if(!["resident","admin"].includes(role)||!identifier||!password)return res.status(400).json({ok:false,error:"Enter your ID/address and password."});const col=role==="admin"?"staff_id":"address";const r=await pool.query(`SELECT * FROM society_users WHERE role=$1 AND LOWER(${col})=LOWER($2) LIMIT 1`,[role,String(identifier).trim()]);const u=r.rows[0];if(!u||!(await bcrypt.compare(String(password),u.password_hash)))return res.status(401).json({ok:false,error:"Wrong ID or password."});req.session.user={id:u.id,role:u.role};res.json({ok:true,user:userShape(u)});}));
app.post("/api/auth/signup",run(async(req,res)=>{const {role,name,address,phone,password}=req.body||{};if(role==="admin")return res.status(403).json({ok:false,error:"Staff accounts can't be created here. Use the demo staff login shown at the top."});if(!name||!String(address||"").trim()||String(password||"").length<4)return res.status(400).json({ok:false,error:"Please fill in name, address and a password of at least 4 characters."});try{const r=await pool.query("INSERT INTO society_users(role,name,address,phone,password_hash) VALUES('resident',$1,$2,$3,$4) RETURNING *",[String(name).trim(),String(address).trim(),String(phone||""),await bcrypt.hash(String(password),10)]);req.session.user={id:r.rows[0].id,role:"resident"};res.status(201).json({ok:true,user:userShape(r.rows[0])});}catch(e){if(e.code==="23505")return res.status(409).json({ok:false,error:"That address is already registered."});throw e;}}));
app.post("/api/auth/logout",(req,res)=>req.session.destroy(e=>{res.clearCookie("smart_society.sid");if(e)return res.status(500).json({ok:false,error:"Could not log out."});res.json({ok:true});}));
app.get("/api/complaints",signedIn,run(async(req,res)=>{let r;if(req.query.scope==="all"){if(req.session.user.role!=="admin")return res.status(403).json({ok:false,error:"Staff only."});r=await pool.query("SELECT * FROM complaints ORDER BY created_at DESC");}else r=await pool.query("SELECT c.* FROM complaints c JOIN society_users u ON LOWER(c.address)=LOWER(u.address) WHERE u.id=$1 ORDER BY c.created_at DESC",[req.session.user.id]);res.json({ok:true,complaints:r.rows.map(complaintShape)});}));
app.post("/api/complaints",signedIn,run(async(req,res)=>{if(req.session.user.role!=="resident")return res.status(403).json({ok:false,error:"Residents only."});const b=req.body||{};if(!b.title||!b.category)return res.status(400).json({ok:false,error:"Title and category are required."});const u=(await pool.query("SELECT * FROM society_users WHERE id=$1",[req.session.user.id])).rows[0];const n=await pool.query("SELECT COALESCE(MAX(CAST(SUBSTRING(id FROM 6) AS INT)),146)+1 n FROM complaints WHERE id LIKE 'MG-B-%'");const id="MG-B-"+String(n.rows[0].n).padStart(4,"0"),now=Date.now();const photoData=typeof b.photoData==="string" && b.photoData.startsWith("data:image/") ? b.photoData : "";if(photoData.length>2800000)return res.status(413).json({ok:false,error:"Photo is too large. Please choose an image under 2 MB."});const r=await pool.query("INSERT INTO complaints(id,category,address,title,details,status,urgency,note,resident_name,created_at,updated_at,photo_data) VALUES($1,$2,$3,$4,$5,'Pending',$6,'',$7,$8,$8,$9) RETURNING *",[id,b.category,b.address||u.address,String(b.title).trim(),b.details||"",["Low","Medium","High"].includes(b.urgency)?b.urgency:"Medium",u.name,now,photoData]);res.status(201).json({ok:true,complaint:complaintShape(r.rows[0])});}));
app.patch("/api/complaints/:id",staffOnly,run(async(req,res)=>{const status=req.body?.status;if(!["Pending","In progress","Resolved"].includes(status))return res.status(400).json({ok:false,error:"Invalid complaint status."});const r=await pool.query("UPDATE complaints SET status=$1,updated_at=$2 WHERE id=$3 RETURNING *",[status,Date.now(),req.params.id]);if(!r.rowCount)return res.status(404).json({ok:false,error:"Complaint not found."});res.json({ok:true,complaint:complaintShape(r.rows[0])});}));
const svc={gardening:["Gardening","Maintenance"],plumbing:["Plumbing","Water"],electricity:["Electricity","Electricity"],househelp:["Househelp","Cleanliness"]};
app.get("/api/services",signedIn,run(async(req,res)=>{const r=await pool.query("SELECT s.* FROM service_requests s JOIN society_users u ON LOWER(s.address)=LOWER(u.address) WHERE u.id=$1 ORDER BY s.added_at DESC",[req.session.user.id]);res.json({ok:true,services:r.rows.map(serviceShape)});}));
app.post("/api/services",signedIn,run(async(req,res)=>{if(req.session.user.role!=="resident")return res.status(403).json({ok:false,error:"Services are for members only."});const id=String(req.body?.serviceId||""),info=svc[id];if(!info)return res.status(400).json({ok:false,error:"Unknown service."});const u=(await pool.query("SELECT * FROM society_users WHERE id=$1",[req.session.user.id])).rows[0],now=Date.now();await pool.query("INSERT INTO service_requests(id,service_id,name,category,status,note,added_at,updated_at,added_by,address) VALUES($1,$2,$3,$4,'Requested','',$5,$5,$6,$7)",["s"+now.toString(36)+Math.random().toString(36).slice(2,7),id,info[0],info[1],now,u.name,u.address]);res.status(201).json({ok:true});}));
app.get("/api/services/all",staffOnly,run(async(req,res)=>{const r=await pool.query("SELECT * FROM service_requests ORDER BY added_at DESC");res.json({ok:true,services:r.rows.map(serviceShape)});}));
app.patch("/api/services/:id",staffOnly,run(async(req,res)=>{const status=req.body?.status;if(!["Requested","In progress","Provided","Completed","Cancelled"].includes(status))return res.status(400).json({ok:false,error:"Invalid service status."});const r=await pool.query("UPDATE service_requests SET status=$1,updated_at=$2 WHERE id=$3 RETURNING *",[status,Date.now(),req.params.id]);if(!r.rowCount)return res.status(404).json({ok:false,error:"Service request not found."});res.json({ok:true,service:serviceShape(r.rows[0])});}));
app.post("/api/admin/reset-demo",staffOnly,run(async(req,res)=>{await pool.query("DELETE FROM service_requests");await pool.query("DELETE FROM complaints");res.json({ok:true,added:0});}));
app.use(express.static(path.join(__dirname,"public")));
app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.use((err,req,res,next)=>{console.error(err);res.status(500).json({ok:false,error:process.env.NODE_ENV==="production"?"Server error.":err.message||"Server error."});});
init().then(()=>app.listen(port,()=>console.log(`Smart Society running at http://localhost:${port}`))).catch(e=>{console.error("PostgreSQL startup failed:",e.message);console.error("Set DATABASE_URL and start PostgreSQL.");process.exit(1);});
