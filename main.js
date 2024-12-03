require("dotenv").config();

const https = require('https')
const http = require('http');

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
const wss = require("ws")
const fs = require('fs');
const mime = require('mime-types')

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
const MEDIADIRECTORY = path.join(__dirname,'Media');

function EnsureDirectories(params) {
    if(!fs.existsSync(MEDIADIRECTORY)){
        fs.mkdirSync(MEDIADIRECTORY)
    }
}

const app = express();

//These are the main server that do the listening
let server;
const IsDevMode = process.argv[2] == 'dev';

if(IsDevMode){
    
    server = http.createServer({

    },app)
}else{    
    server = https.createServer({
        cert : fs.readFileSync('./selfsigned.crt'),
        key : fs.readFileSync('./selfsigned.key'),
        rejectUnauthorized : false
    },app);
}
//peer server
const peer = ExpressPeerServer(server,{
    debug : true,
})

app.use(express.urlencoded())
app.use(express.json());

//This websocket handles Kernal operations
//can this handle both Terminal and Notebook_kernal operations? I believe it can
const kernal_server = new wss.WebSocketServer({noServer : true});

const devices = os.networkInterfaces();
const keys = Object.keys(devices);

for(const key of keys){
    const net = devices[key];
    for(const network of net){
        if(network.family != 'IPv4') continue;
        const pref = IsDevMode ? '' : 's';
        console.log(`Listening on http${pref}://${network.address}:${PORT}`);
    }
}
function getRandomNumbers() {
    const typedArray = new Uint8Array(10);
    const randomValues = crypto.getRandomValues(typedArray);
    return randomValues.join('');
}
//storage
const upload = multer.diskStorage({
    destination : (req,file,cb)=>{
        cb(null,MEDIADIRECTORY);
    },
    filename : async (req,file,cb)=>{

        const ext = mime.extension(file.mimetype);
        const aname = `${getRandomNumbers()}.${ext}`;
        try{
            if(req.PROFILE){
                await DB('users')
                .where({username : req.AUTH.username})
                .update({picture : aname})
            }else{
                //this was a message
                const msg = req.MESSAGE;
                await DB('messages')
                .insert({
                    thread : msg.thread,
                    message : msg.isfile ? aname : msg.message,
                    date : msg.date,
                    isfile : msg.isfile,
                    from : req.AUTH.username
                })
            }
            
            cb(null,aname);

        }catch(e){
            console.log('failed to save',e);
            cb("could not save profile")
        }
        
    }
})

function fileFilter(req,file,cb){

    cb(null,true);
}
const storage = multer({storage : upload,fileFilter : fileFilter})


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
        table.string("username").primary().notNullable();
        table.string("password").notNullable();
        table.string("desc");
        table.string("picture");
        //table.boolean("privelidged");
    })

    const Files = DB.schema.createTable("friends",(table)=>{
        table.increments("id").primary();
        table.integer("from").references("username").inTable("users");
        table.integer("to").references("username").inTable("users");
        table.boolean("accepted");
    })
    const Messages = DB.schema.createTable("messages",(table)=>{
        table.increments("id").primary();
        table.integer("thread").references("id").inTable("threads");
        table.string("message").notNullable()//if file, message becomes path of file
        table.string("date").notNullable();
        table.boolean("isfile");
        table.string('from').references('username').inTable('users');
    })
    const Groups = DB.schema.createTable("groups",(table)=>{
        table.increments("id").primary()
        table.string("name");
    })
    const Threads = DB.schema.createTable("threads",(table)=>{
        table.increments("id").primary()
        table.integer("group").references("id").inTable("groups");
        table.boolean("videochat");//if true, chat is video only otherwise text chat
        table.string('name');
    })
    const GroupMembers = DB.schema.createTable("groupmembers",(table)=>{
        table.increments("id").primary();
        table.integer("group").references("id").inTable("groups");
        table.integer("member").references("username").inTable("users");
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

        return next();

    }catch(e){
        return res.status(401).json({message : "invalid"});
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

    const [username, password] = encodedcredentials.split(':');

    const user = await DB('users')
    .where('username','=',username)
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

    const [username,password] = encodedcredentials.split(':');

    const salt = bcrypt.genSaltSync(10);
    console.log(username,password,salt);
    const password_hash = bcrypt.hashSync(password,salt);

    const result = await DB('users')
    .insert({password : password_hash,username : username})
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
function Websocket_upgrade(req,sock,head){
    //authenticate
    if(req.url == '/live'){
        kernal_server.handleUpgrade(req,sock,head,(ws)=>{
            kernal_server.emit('connection',ws,req);
        })
    }else if(req.url == '/peer'){
        peer.handleUpgrade(req,sock,head,(ws)=>{
            peer.emit('connection',ws,req);
        })
    }else{
        sock.destroy();
    }
}

server.on('upgrade',Websocket_upgrade);

//kernal server webscokets
kernal_server.on('connection',(socket)=>{
    socket.on('message',(data,inbin)=>{
        const string = Buffer.from(data).toString();
        let username = '';

        //validate token if not valid quit
        if(!socket.is_verified){
            try {
                const verified = jwt.verify(string,TOKEN_SECRET,{});
                username = verified.username;
                socket.is_verified = true;
                socket.AUTH = {
                    username : username
                }
            }catch(e){
                console.log('invalid token',e);
                socket.close();
            }
            return;
        }

        //parse messages
        const json = JSON.stringify(string);
        

    })
}) 

//for when the server needs to send something to the websocket
kernal_server.on('forward',async (data)=>{
    //data is json

    const msg = data.msg;
    console.log("forward",msg);

    //kernal_server.listeners
    if(msg == 'Pull Messages'){
        //thread : id,
        //from : req.AUTH.username,
        //date : date
        kernal_server.clients.map((itm)=>{
            itm.send(JSON.stringify({
                msg : 'Pull Messages',
                thread : msg.thread,
                from : msg.from,
                date : msg.date
            }))
        })
    }else if(msg == 'Get Members'){

        const usernames = data.members
        kernal_server.clients.forEach((itm)=>{
            if(usernames.includes(itm.AUTH.username)){
                itm.send(JSON.stringify({msg : "Get Members",server : data.sid}))
            }
        })
        
    }else if(msg == 'Get Messages'){
        const mems = await DB('groupmembers')
        .select('*')
        .where({group : data.thread})

        const usernames = mems.map((itm)=>itm.member)
        console.log(usernames);
        kernal_server.clients.forEach((itm)=>{

            if(usernames.includes(itm.AUTH.username)){
                itm.send(JSON.stringify({msg : "Get Messages",date : data.date,thread : data.thread}))
            }
        })
    }
})


//Registration
app.post("/login",LoginAuth);

app.post("/logout",AuthReq,(req,res)=>{

    res.sendStatus(200);
})

app.post('/verify',AuthReq,(req,res)=>{
    res.sendStatus(200);
});
app.get('/profile/:user',AuthReq,async(req,res)=>{
    try{
        const [prof] =await DB('users')
        .select('desc','picture','username')
        .where({username : req.params.user})

        const ras = ["Hey buddy","Top Gamer", "Super Man"]
        let profile = {
            id : prof.id,
            desc : prof.desc ? prof.desc : ras.at(Math.random() * 10 % ras.length),
            picture : prof.picture ? prof.picture : 'default.png',
            username : req.params.user
        }

        res.send(profile);
    }catch(e){
        console.log(e,'profile name');
        res.sendStatus(500);
    }
})
//update the profile
app.post('/profile',AuthReq,async (req,res)=>{
    try{

        const rows = await DB('users')
        .select({username : req.AUTH.username})
        .update({
            desc : req.body.desc
        })
        
        res.sendStatus(200);
    }catch(e){
        console.log("profile post",e)
        res.sendStatus(500);
    }
})
app.post('/profile/picture',AuthReq,async(req,res,next)=>{
    req.PROFILE = {};
    next();
},storage.any(),(req,res)=>{
    res.sendStatus(200);
})

app.get('/profile',AuthReq,async (req,res)=>{
    try{
        const [prof] =await DB('users')
        .select('desc','picture','username')
        .where({username : req.AUTH.username})

        const ras = ["Hey buddy","Top Gamer", "Super Man"]
        let profile = {
            id : prof.id,
            desc : prof.desc ? prof.desc : ras.at(Math.random() * 10 % ras.length),
            picture : prof.picture ? prof.picture : 'default.png',
            username : req.AUTH.username
        }

        res.send(profile);
    }catch(e){
        console.log(e,'profile');
        res.sendStatus(500);
    }
})

app.get('/media/:name',async(req,res)=>{
    try{
        const name = req.params.name;
        const apath = path.join(MEDIADIRECTORY,name);

        res.sendFile(apath)
    }catch(e){
        res.sendStatus(500);

    }
})

app.post("/register",RegisterAuth);

app.get('/members/:server',AuthReq,async(req,res)=>{
    //send the members of this server

    try{
        const li = await DB('groupmembers')
        .select('*')
        .where({group : req.params.server})

        const names = li.map((itm)=>itm.member);

        const mems = await DB('users')
        .select('desc','picture','username')
        .whereIn('username', names)

        const adj = mems.map((itm)=>({
            desc : itm.desc ? itm.desc : '...',
            picture : itm.picture ? itm.picture : 'default.png',
            username : itm.username
        }));

        res.send(adj);
    }catch(e){
        console.log("members server",e);
        res.sendStatus(500);
    }
})
app.post('/members/add',AuthReq,async(req,res)=>{
    try{
        const sid = req.body.id;
        const name = req.body.name;


        await DB('groupmembers')
        .insert({group : sid,member : name})
        
        res.sendStatus(200);
        let mems = await DB('groupmembers')
        .select('*')
        .where({group : sid})
        
        mems = mems.map((itm)=>itm.member)

        
        kernal_server.emit('forward',{
            msg : "Get Members",
            sid : sid,
            members : mems
        })
    }catch(e){
        console.log("members server",e);
        res.sendStatus(500);
    }
})
app.post('/members/remove',AuthReq,async(req,res)=>{
    try{
        const sid = req.body.id;
        const name = req.body.name;

        
        let mems = await DB('groupmembers')
        .select('*')
        .where({group : sid,member : name})
        
        mems = mems.map((itm)=>itm.member)

        await DB('groupmembers')
        .where({group : sid,member : name})
        .del();

        res.sendStatus(200);
        kernal_server.emit('forward',{
            msg : "Get Members",
            sid : sid,
            members : mems
        })
    }catch(e){
        console.log("members remove",e);
        res.sendStatus(500);
    }
})

app.get('/server/:id',AuthReq,async(req,res)=>{
    //get the channels in the server
    try{
        const data = await DB('threads')
        .select('*')
        .where({group : req.params.id})

        res.send(data)
    }catch(e){
        console.log("server with id ",e);
        res.sendStatus(403);
    }
})

app.post('/server/create',AuthReq,async(req,res)=>{
    try{
        const aname = req.body.name;
        const [aserver] = await DB('groups')
        .insert({name : aname})
        .returning('*')

        const inserted = await DB('groupmembers')
        .insert({group : aserver.id,member : req.AUTH.username})

        if(inserted.length){
            return res.sendStatus(200)
        }else{
            res.sendStatus(500);
        }
    }catch(e){
        console.log("eror creating server",e);
        res.sendStatus(500);
    }
})
app.post('/server/thread',AuthReq,async(req,res)=>{
    try{
        const aname = req.body.name;
        const server = req.body.server;
        const ischat = req.body.ischat;
        const thr = await DB('threads')
        .insert({
            name : aname,
            group : server,
            videochat : !ischat
        })

        if(thr.length){
            res.sendStatus(200);
        }else{
            res.sendStatus(403);
        }
        

    }catch(e){
        console.log("server therad",e);
        res.sendStatus(500);
    }
})
app.get('/server/thread/:id',AuthReq,async(req,res)=>{
    try{
        const id = req.params.id;
        const asdf = await DB('threads')
        .where({group : id})

        res.send(asdf);

    }catch(e){
        console.log('thread id server',e);
        res.sendStatus(500)
    }
})
//this actuall sends data
app.post('/thread/messages',AuthReq,async (req,res)=>{
    try{
        let date = req.body.date;//a number
        date = date != undefined ? date : 0;
        const id = req.body.thread;

        const m = await DB('messages')
        .select('*')
        .where({thread : id})
        .andWhere('date','>=',date);

        res.send(m);
        //update users 
        kernal_server.emit('forward',{
            msg : 'Pull Messages',
            thread : id,
            from : req.AUTH.username,
            date : date
        })
    }catch(e){
        console.log("thread message",e);
        res.sendStatus(500);
    }
})

//test based
app.post('/message',AuthReq,async(req,res,)=>{
    const msg = {
        isfile : false,
        message : req.body.message,
        thread : req.body.thread,
        date : req.body.date,
        from : req.AUTH.username
    }

    req.MESSAGE = msg;
    try{
        await DB('messages')
        .insert(msg)

        res.sendStatus(200);
        kernal_server.emit('forward',{
            msg : 'Get Messages',
            thread : req.body.thread,
            date : req.body.date,
            from : req.body.from
        })
    }catch(e){
        res.sendStatus(500);
        console.log("message text",e);
    }
});

//images only
app.post('/message/:date/:id',AuthReq,async(req,res,next)=>{
    const msg = {
        isfile : true,
        thread : req.params.id,
        date : req.params.date,
    }

    req.MESSAGE = msg;
    next();
},storage.any(),(req,res)=>{
    res.sendStatus(200);
    kernal_server.emit('forward',{
        msg : 'Get Messages',
        thread : req.params.thread,
        date : req.params.date,
        from : req.body.from
    })
})
app.get('/message/:date/:id',async(req,res)=>{
    try{
        const date = req.params.date;
        const id = req.params.id;

        const val = await DB('messages')
        .where({
            thread : id
        })
        .andWhere('date','>=',date);
        res.send(val);
    }catch(e){
        console.log("message date",e);
        res.sendStatus(500);

    }
})

app.post('/friend/add',AuthReq,async (req,res)=>{
    try{
        const to = req.body.to;
        const from = req.body.from;
        //make sure to/from doesn't already exists
        //if this exists in the opposite way, accept the friendship
        const [exists] = await DB('friends')
        .select('*')
        .where({to : to,from : from})
        if(exists && to != from){
            //you already added him as a friend
            return res.sendStatus(200);
        }
        const [rev] = await DB('friends')
        .select('*')
        .where({from : to,to : from})
        if(rev){
            //update this user
            await DB('friends')
            .select('*')
            .where({from : to,to : from})
            .update({accepted : true})

            kernal_server.emit('forward',{
                msg : 'Get Friends',
                from : to,
                to : from
            })
            return res.sendStatus(200);
        }
        //they are unowns
        await DB('friends')
        .insert({accepted : false,to : to,from : from})
        res.sendStatus(200);
        
        kernal_server.emit('forward',{
            msg : 'Get Friends',
            from : to,
            to : from
        })

    }catch(e){
        res.sendStatus(500);
        console.log("friend add",e);
    }
})

app.post('/friend/remove',AuthReq,async (req,res)=>{
    try{
        const to = req.body.to;
        const from = req.body.from;

        await DB('friends')
        .select('*')
        .where({to : to,from : from})
        .del();
        await DB('friends')
        .select('*')
        .where({to : from,from : to})
        .del();
        res.sendStatus(200);
        
        kernal_server.emit('forward',{
            msg : 'Get Friends',
            from : to,
            to : from
        })
    }catch(e){
        console.log("remove frind",e);
        res.sendStatus(500);
    }
})
app.get('/friends',AuthReq,async (req,res)=>{
    try{
        const friends = await DB('friends')
        .select('*')
        .where({to : req.AUTH.username})
        .orWhere({from : req.AUTH.username})

        res.send(friends);
    }catch(e){
        console.log("error getting friends",e);
        res.sendStatus(500);
    }
})
app.get('/server',AuthReq,async (req,res)=>{
    try{
        const servers = await DB('groupmembers')
        .select('*')
        .where({member : req.AUTH.username})

        const ids = servers.map((itm)=>itm.group)

        let sl = await DB('groups')
        .select('*')
        .whereIn('id',ids)

        res.send(sl);

    }catch(e){
        console.log("failed to get group",e);
        res.sendStatus(500);
    } 
})


async function start(){
    await DatabaseChecks()
    EnsureDirectories();
    
    server.listen(PORT);
}

start()