require("dotenv").config();

const https = require('https')
const knex = require("knex");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken")
const multer = require("multer");
const os = require('os');
const express = require('express');
const cors = require('cors');
const path = require("path");
const crypto = require('crypto');
const {ExpressPeerServer} = require('peer')
const ws = require("ws")
/**
 * 
 * Video Chatting is only available over https:// so we must use an https for webservices
 * 
 */


//list and get network devices

const SECURE_PORT = 443;
const PORT = 8365;//swap to port 80 if prod env is set
const TOKEN_SECRET = process.env.TOKEN_SECRET || "development";
const FRONTEND_DIERCTORY = path.join(__dirname,'build');


const app = express();

//These are the main server that do the listening
const https_server = https.createServer({},app);

//peer server
const peer = ExpressPeerServer(https_server,{
    debug : true,
    path : "/"
})
app.use("/peer",peer);

//This websocket handles Kernal operations
//can this handle both Terminal and Notebook_kernal operations? I believe it can
const kernal_server = new ws.WebSocketServer({noServer : true});
//websocket for file operations
const space_server = new ws.WebSocketServer({noServer : true});


const devices = os.networkInterfaces();
const keys = Object.keys(devices);

for(const key of keys){
    const net = devices[key];
    for(const network of net){
        if(network.family != 'IPv4') continue;
        console.log(`Listening on https://${network.address}:${PORT}`);
    }
}

/** 
 * Setup the server
 */
app.use(cors({
    allowedHeaders : '*',
    origin : '*',
    methods : '*', 
}))

/**
 * @type {knex.Knex}
 */
let DB;
if(process.env.PRODUCTION_DATABASE){
    DB = knex({
        client : 'mysql2',
        connection : {
            host : '0.0.0.0',
            user : 'edgefund',
            password : 'edgefund',
            database : 'edgefund'
        }
    })
}else{
    DB = knex({
        client : 'sqlite3',
        connection : {
            filename : path.join(__dirname,"development.sqlite3")
        },
        useNullAsDefault : true
    })
}

//initializes the database if it is not
async function DatabaseChecks(){  
    const User = DB.schema.createTable("users",(table)=>{
        table.increments("id")
        table.string("username");
        table.string("password");
        table.string("email").primary();
        table.string("desc");
        table.string("picture");
        //table.boolean("privelidged");
    })

    const Files = DB.schema.createTable("friends",(table)=>{
        table.increments("id").primary();
        table.integer("from").references("id").inTable("users");
        table.integer("to").references("id").inTable("users");
        table.boolean("accepted");
    })
    const Messages = DB.schema.createTable("messages",(table)=>{
        table.increments("id").primary();
        table.integer("thread").references("id").inTable("threads");
        table.string("message").notNullable()
        table.string("date").notNullable();
        table.boolean("isfile");
    })
    const Groups = DB.schema.createTable("groups",(table)=>{
        table.increments("id").primary()
        table.string("name");
    })
    const Threads = DB.schema.createTable("threads",(table)=>{
        table.increments("id").primary()
        table.integer("group").references("id").inTable("groups");
        table.boolean("videochat");//if true, chat is video only otherwise text chat

    })
    const GroupMembers = DB.schema.createTable("groupmembers",(table)=>{
        table.increments("id").primary();
        table.integer("group").references("id").inTable("groups");
        table.integer("member").references("id").inTable("users");
    })
    
    //file uploading, texting,video calling, profile image changing

    User.then(()=>{
        console.log("successfully created user tables");
        return Files;
    }).then(()=>{
        console.log("Made File");
        return Messages
    }).then(()=>{
        console.log("Made Messages")
        return Groups
    }).then(()=>{
        console.log("Made Groups")
        return Threads
    }).then(()=>{
        console.log("Made Threads")
       return GroupMembers 
    }).then(()=>{
        console.log("successfully created GroupMembers table")
    }).catch(()=>{
        console.log("tables already exists");
    })
}


//Middleware
// * token Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJqb2huZG9lIiwiaWF0IjoxNTIwNDkyMzIyfQ.4g5Zt97Q3q3q56c9_Q0_Q0_Q0_Q0_Q0_Q0_Q0_Q0_Q0_Q0

/**
 * Authenticates the user
 * @param {express.Request<{}, any, any, qs.ParsedQs, Record<string, any>>} req 
 * @param {express.Response<any, Record<string, any>, number>} res 
 * @param {Function} next 
 */
async function AuthReq(req,res,next){
    const TokenHeader = req.headers.authorization;
    if(!TokenHeader) return res.status(403).json({message : "auth header is invalid"});

    const [type,token] = TokenHeader.split(" ");
    if(type != 'Bearer') return res.status(403).json({message : "auth schema is invalid"});

    //check if jwt token is valid. Set who this is as req.AUTH = {user};
    try {
        const verified = jwt.verify(token,TOKEN_SECRET,{});
        
        req.AUTH = {
            username : verified.username
        }

        if(req.is_socket_request){
            return true;
        }else{
            return next();
        }
        
    }catch(e){
        if(req.is_socket_request){
            return false;
        }else{
            return res.status(401).json({message : "invalid"});
        }
    }
    
}

/**
 * Authenticates the user
 * @param {express.Request<{}, any, any, qs.ParsedQs, Record<string, any>>} req 
 * @param {express.Response<any, Record<string, any>, number>} res 
 * @param {Function} next 
 */
async function LoginAuth(req,res,next){
    //find the ha
    const authheader = req.headers.authorization;
    if(!authheader) return res.status(401).send("bad header");

    const [auth,encodedcredentials] = authheader.split(" ");
    if(auth != 'Basic') return res.status(401).json({message : "bad credentials"});

    const credentials = Buffer.from(encodedcredentials, 'base64').toString('utf-8');
    const [email, password] = credentials.split(':');

    const user = await DB('users')
    .where('email','=',email)
    .select('*')
    .then((rows)=>{
        if(rows.length < 1){
            return '';
        }else{
            return rows[0];
        }
    }).catch((e)=>{
        console.error("error on database",e);
        return '';
    })

    if(!user) return res.status(401).json({message : "no"});

    //compare the password
    const valid = bcrypt.compareSync(password,user.password);
    if(!valid) return res.status(401).send({message : "invalid password"});

    const token = jwt.sign({username : user.username},TOKEN_SECRET);


    res.status(200).json({token : token});
}

async function RegisterAuth(req,res,next){
    //submit email, password and username
    const authheader = req.headers.authorization;
    if(!authheader) return res.status(401).send("bad header");

    const [auth,encodedcredentials] = authheader.split(" ");
    if(auth != 'Basic') return res.status(401).json({message : "bad credentials"});

    const credentials = Buffer.from(encodedcredentials, 'base64').toString('utf-8');
    const [email, password,username] = credentials.split(':');

    const salt = bcrypt.genSaltSync(10);
    const password_hash = bcrypt.hashSync(password,salt);

    const result = await DB('users')
    .insert({email : email,password : password_hash,username : username})
    .then((rows)=>{
        return !!rows.length;
    })
    .catch((e)=>{
        console.log("error " + e);
        return false;
    })

    if(result){
        return res.status(200).json({message : "created user"});
    }else{
        return res.status(401).send({message : "could not create user"});
    }
}

app.use('/',express.static(FRONTEND_DIERCTORY,{}));

//add the websocket support
/**
 * 
 * @param {http.IncomingMessage} req 
 * @param {internal.Duplex} sock 
 * @param {Bugger} head 
 */
async function Websocket_upgrade(req,sock,head){
    const { pathname } = new URL(request.url, 'wss://base.url');
    //const {pathname} = new URL();

    //authenticate
    req.is_socket_request = true;
    const is_valid = await AuthReq(req);
    if(!is_valid){
        sock.destroy();
        return;
    }


    if(pathname == '/kernel'){
        kernal_server.handleUpgrade(req,sock,(ws)=>{
            kernal_server.emit('connection',ws,req);
        })
    }else{
        sock.destroy();
    }
}

https_server.on('upgrade',Websocket_upgrade);

//Registration
app.post("/login",LoginAuth);

app.post("/logout",AuthReq,(req,res)=>{

    res.sendStatus(200);
})

app.post('/verify',AuthReq,(req,res)=>{
    res.sendStatus(200);
});

app.post("/register",RegisterAuth);

//kernal server webscokets
kernal_server.on('connection',(socket)=>{
    
})


async function start(){
    await DatabaseChecks()
    
    https_server.listen(PORT);
}

start()