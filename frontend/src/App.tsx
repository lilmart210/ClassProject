import React, { ChangeEvent, FormEvent, HTMLInputAutoCompleteAttribute, useEffect, useMemo, useRef, useState } from 'react'
import svgurl from './assets/react.svg'
import './App.css'

type Profile = {
  desc : string,
  picture : string,
  username : string
}
type Friends = {
  id : number,
  from : string,
  to : string,
  accepted : boolean
}
type Servers = {
  id : number,
  name : string
}
type ServerMember = {
  id : number,
  group : number,
  member : string
}
type Thread = {
  id : number,
  group : number,
  videochat : boolean,
  name : string
}
type Message = {
  id : number,
  thread : number,
  message : string,
  date : number,
  isfile : boolean,
  from : string
}

export function App() {
  const [SelectedChat, SetSelectedChat] = useState<Servers>();
  const [InspectUser, SetInspectUser] = useState<string | undefined>();

  const [ShowProfile, SetShowProfile] = useState(false);
  const [ShowLogin, SetShowLogin] = useState(false);
  const [Uploads, SetUploads] = useState<File[]>([]);
  const [MediaDevices, SetMediaDevices] = useState<Array<InputDeviceInfo | MediaDeviceInfo>>([]);
  const [Token,SetToken] = useState('');

  const [ShowNewServer,SetShowNewServer] = useState(false);
  const [ShowRegister,SetShowRegister] = useState(false);
  const [ShowAddThread,SetShowAddThread] = useState(false);
  const [ShowAddFriend,SetShowAddFriend] = useState(false);

  const [RegisterMessage,setRegisterMessage] = useState('');
  const [LoginMessage,SetLoginMessage] = useState('');
  const [Profile,SetProfile] = useState<Profile>()

  const [Friends,SetFriends] = useState<Friends[]>([]);
  const [ServerList,SetServerList] = useState<Servers[]>([]);
  const [ServerMemberList,SetServerMemberList] = useState<ServerMember[]>([]);
  const [ServerThreads,SetServerThreads] = useState<Thread[]>([]);
  const [SelectedThread,SetSelectedThread] = useState<Thread>();
  const [SelectedServerMemberList,SetSelectedServerMemberList] = useState<Profile[]>([])
  const [SelectedMember,SetSelectedMember] = useState<Profile>();
  const [SelectedThreadMessages,SetSelectedThreadMessages] = useState<Message[]>([]);
  const [ShowAddChatMember,SetShowAddChatMember] = useState(false);
  const [Sticky,SetSticky] = useState(false);
  const forcebottomref = useRef(true);

  const SocketRef = useRef<null | WebSocket>(null);
  
  const MsgRef = useRef<HTMLInputElement>(null);
  const ProfileUpload = useRef<HTMLInputElement>(null);
  const ScrollContainerRef = useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const itm = localStorage.getItem('Token');
    if(itm) SetToken(itm);

  },[])

  useEffect(()=>{
    if(!Token) return;

    const asock = CreateSocket('/live',Token)
    
    asock.then((res)=>{
      SocketRef.current = res;
      res.addEventListener('message',MessageListener)
    }).catch(()=>{console.log("failed")})
    localStorage.setItem('Token',Token);
    
    return ()=>{
      if(SocketRef.current) SocketRef.current.close();
    }
  },[Token,SelectedThread,SelectedChat,ServerList])
  function GetSC(){
    return SelectedChat;
  }

  function MessageListener(e : MessageEvent){

    const data = e.data;
    const json = JSON.parse(data);
    console.log(SelectedChat,json,GetSC());
    if(json.msg == 'Get Messages' && SelectedThread && Number(json.thread) == SelectedThread.id){
      GetChatMessages(json.date);
    }else if(json.msg == 'Get Members' || SelectedChat && Number(json.server) == SelectedChat.id){
      GetServers();
      console.log("sersf')",json);

      GetChatMembers()
      
    }else if(json.msg == 'Get Members'){

    }

  }

  function ScrollToBottom(){
    if(!ScrollContainerRef.current || !Sticky) return;

    //only scroll to bottom if the scroll was already at the bottom
    //ScrollContainerRef.current.scrollTop = ScrollContainerRef.current.scrollHeight;
    ScrollContainerRef.current.lastElementChild?.scrollIntoView({behavior : 'smooth',block : 'end'})
  }
  function ForceBottom(){
    if(!ScrollContainerRef.current) return;

    //only scroll to bottom if the scroll was already at the bottom
    //ScrollContainerRef.current.scrollTop = ScrollContainerRef.current.scrollHeight;
    ScrollContainerRef.current.lastElementChild?.scrollIntoView({behavior : 'smooth',block : 'end'})
  }

  useEffect(()=>{
    ScrollToBottom();
    if(forcebottomref.current){
      ForceBottom();
      forcebottomref.current = false;
    }
  },[SelectedThreadMessages])


  useEffect(()=>{
    if(!SelectedThread) {
      SetSelectedChat(undefined);
      SetSelectedMember(undefined);
      return;
    };
    //get the thread messages
    GetChatMessages(0)
    return()=>{
      SetSelectedThreadMessages([]);
      forcebottomref.current = true;
    }
  },[SelectedThread])

  function HandleScroll(e : React.WheelEvent<HTMLDivElement>){
    if(!ScrollContainerRef.current) return;
    const diff = ScrollContainerRef.current.scrollTop + ScrollContainerRef.current.scrollHeight == ScrollContainerRef.current.scrollHeight;
    
    if(e.deltaY < 0){
        SetSticky(false);
    }else if(diff){
        SetSticky(true);
    }
  }  

  function CreateSocket(dest : string = '/live',atoken : string){
    let prefix = import.meta.env.VITE_SOCKET;
    prefix = prefix ? prefix + dest: dest;

    const prm = new Promise<WebSocket>((res,rej)=>{
      
      const socket = new WebSocket(prefix)
      let opened = false;

      socket.onopen =()=>{
        opened = true;
        socket.send(atoken);
        res(socket);
      }
      socket.onclose = (e)=>{
        if(opened) return;
        rej("could not open");
      }
    })
    return prm;
  }
  function MyFetch(dest : string,opts? : RequestInit){
    let prefix = import.meta.env.VITE_SERVER;
    prefix = prefix ? prefix : '';
    return fetch(prefix + dest,{
        ...opts,
        headers : {
            'Authorization' : `Bearer ${Token}`,
            ...opts?.headers,
        },
        

    })
}

  async function ChangeProfilePic(e : ChangeEvent<HTMLInputElement>){
    if(!e.target.files) return;
    const vals = Array.from(e.target.files);
    const fd = new FormData;
    vals.forEach((itm,i)=>{
      fd.append(`file-${i}`,itm);
    })
    //update profile
    const res = await MyFetch('/profile/picture',{
      method : 'POST',
      body : fd
    })
    if(res.status == 200){
      GetProfile();
    }
  }
  useEffect(() => {
    const intervalnum = setInterval(() => {
      const md = navigator.mediaDevices.enumerateDevices();
      md.then((res) => {
        SetMediaDevices(res);
      })
    }, (5000));

    return () => {
      clearInterval(intervalnum);
    }
  }, [])

  async function UpdateProfile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const desc = fd.get('desc');

    const res = await MyFetch('/profile',{
      method :'POST',
      headers : {
        'Content-Type' : 'application/json'
      },
      body : JSON.stringify({desc : desc ? desc : ''})
    })

    const json = res.json();
    GetProfile();
    SetShowProfile(false);
  }

  async function HandleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fm = new FormData(e.currentTarget);
    const body : {[name : string] : any} = {

    }

    fm.forEach((v,k)=>{
        body[k] = v;
    })

    const res = await MyFetch('/login',{
      method : 'POST',
      headers : {
          'Authorization' : `Basic ${body.username}:${body.password}`
      },
    })

    if(res.status == 200){
      SetShowLogin(false);
      //set profile
      const json = await res.json();
      SetToken(json.token);
      console.log("login",json);
    }
    SetLoginMessage(`${res.status} ${res.statusText}`)
  }

  useEffect(()=>{
    if(!Token) return;
    GetProfile();
    GetFriends();
    GetServers();
  },[Token])
  useEffect(()=>{
      if(!SelectedChat) {
        SetSelectedThread(undefined);
        SetSelectedMember(undefined);
        return;
      };
      //get chanel list and people in chats
      GetChatThreads();
      GetChatMembers();
      //if we are not in the selected members list, get chats, we may have been removed
      GetServers();
  },[SelectedChat])
  useEffect(()=>{
    if(!SelectedServerMemberList) return;
    const abs = SelectedServerMemberList.find((itm)=>itm.username == Profile?.username);
    if(!abs){
      GetServers();
      SetSelectedChat(undefined);
      SetSelectedThread(undefined);
    }
  },[SelectedServerMemberList])


  async function GetChatMembers(){
    if(!SelectedChat) return;

    const res = await MyFetch(`/members/${SelectedChat.id}`);
    if(res.status != 200) return;

    const json = await res.json();
    SetSelectedServerMemberList(json);
    console.log(json);
  }

  async function GetServers(){
    const res = await MyFetch('/server')
    if(res.status != 200) return;

    const sl = await res.json();
    
    SetServerList(sl);

  }

  async function GetFriends(){
    const friends = await MyFetch('/friends',{})
    const json = await friends.json();
    SetFriends(json);
  }
  async function GetProfile(){
    const data = await MyFetch('/profile',{})
    if(data.status != 200) {
      console.log("invalid token");

    };

    const json = await data.json();

    SetProfile(json);
  }

  function SelectUploadFiles(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files) return;
    const vals = Array.from(e.target.files);
    SetUploads(prev => [...prev, ...vals]);
  }

  const MemoUploadFiles = useMemo(() => Uploads.map((itm, i) => (
    <UploadDisplay key={i} src={itm} onClose={() => SetUploads(prev => prev.filter((j, k) => k != i))} />
  )), [Uploads])

  async function SubmitMessage() {
    const targ = MsgRef.current;
    if (!targ) return;
    if(!SelectedThread) return;
    if(SelectedThread.videochat) return;

    const date = Date.now();
    
    //post each upload individually
    
    const prms = Uploads.map((itm)=>{
      const fd = new FormData();
      fd.append('file',itm);

      const prm = MyFetch(`/message/${date}/${SelectedThread.id}`,{
        method : 'POST',
        body : fd 
      })
      return prm;
    })
    if(targ.value){
      const m = MyFetch('/message',{
        body : JSON.stringify({
          message : targ.value,
          thread : SelectedThread.id,
          date : date,
        }),
        method : 'POST',
        headers : {
          'Content-Type' : 'application/json'
        },
      })
      prms.push(m)
  
    }
    
    await Promise.all(prms);

    SetUploads([]);
    
    targ.value = '';

    GetChatMessages(date);
  }
  async function HandleNewThread(e : FormEvent<HTMLFormElement>){
    e.preventDefault();

    const fd = new FormData(e.currentTarget);
    const body : {[name : string] : any} = {

    }

    fd.forEach((v,k)=>{
        body[k] = v;
    })

    const res = await MyFetch('/server/thread',{
      body : JSON.stringify(body),
      headers : {
        'Content-Type' : 'application/json'
      },
      method : 'POST'
    })
    if(res.status == 200){
      GetChatThreads();
    }
    SetShowAddThread(false);
  }
  async function GetChatThreads(){
    if(!SelectedChat) return;

    const res = await  MyFetch(`/server/thread/${SelectedChat.id}`)
    if(res.status != 200) return;
    const json = await res.json();
    
    SetServerThreads(json);

  }
  async function GetChatMessages(time : number = 0){
    if(!SelectedThread) return;

    const id = SelectedThread.id;

    const res = await MyFetch(`/message/${time}/${id}`)

    if(res.status != 200) return;
    const json = await res.json();

    SetSelectedThreadMessages(prev=>{
      const msgs = prev.filter((itm)=>itm.date < time);
      return [...msgs,...json]
    })
  }

  async function HandleNewServer(e : FormEvent<HTMLFormElement>){
    e.preventDefault();

    const fd = new FormData(e.currentTarget);
    const body : {[name : string] : any} = {

    }

    fd.forEach((v,k)=>{
        body[k] = v;
    })

    const res = await MyFetch('/server/create',{
      method : "POST",
      body : JSON.stringify(body),
      headers : {
        'Content-Type' : 'application/json'
      }
    })
    if(res.status != 200) return;

    SetShowNewServer(false);
    
    GetServers();
  }
  async function HandleRegister(e : FormEvent<HTMLFormElement>){
    e.preventDefault();
    const fm = new FormData(e.currentTarget);
    const body : {[name : string] : any} = {

    }

    fm.forEach((v,k)=>{
        body[k] = v;
    })

    if(body.password != body.confirm){
      setRegisterMessage("password must match");
      return;
    }

    console.log("registering");

    const res = await MyFetch('/register',{
      method : 'POST',
      headers : {
          'Authorization' : `Basic ${body.username}:${body.password}`
      }
    })

    //try to login
    if(res.status == 200){
      SetShowRegister(false);
      SetShowLogin(true);
      //HandleLogin(e);
    }
    setRegisterMessage(`${res.status} ${await res.text()} ${res.statusText}`);
    console.log(res);
  }
  async function Logout() {
    
    localStorage.setItem('Token','')
    SetToken('');
    SetProfile(undefined)
    SetServerList([])
    SetFriends([]);
    SetSelectedChat(undefined);
  }
  function discordname(aname : string){
    const newname = aname.split('').slice(0,6).map(itm=>itm[0]).join('');
    return newname.toUpperCase();
  }
  async function AddFriend(e : FormEvent<HTMLFormElement>){
    e.preventDefault();

    const fd = new FormData(e.currentTarget);
    const body : {[name : string] : any} = {

    }

    fd.forEach((v,k)=>{
        body[k] = v;
    })

    const res = await MyFetch('/friend/add',{
      method : "POST",
      body : JSON.stringify(body),
      headers : {
        'Content-Type' : 'application/json'
      }
    })
    if(res.status == 200){
      GetFriends();
    }
    SetShowAddFriend(false);
  }
  async function RemoveFriend(name : string){
    if(!Profile) return;
    const body= {
      from : Profile.username,
      to : name
    }
    const res = await MyFetch('/friend/remove',{
      method : "POST",
      body : JSON.stringify(body),
      headers : {
        'Content-Type' : 'application/json'
      }
    })
    if(res.status == 200){
      GetFriends();
    }
  }
  
  async function ShortAddFriend(name : string){
    if(!Profile) return;
    const body= {
      from : Profile.username,
      to : name
    }
    const res = await MyFetch('/friend/add',{
      method : "POST",
      body : JSON.stringify(body),
      headers : {
        'Content-Type' : 'application/json'
      }
    })
    if(res.status == 200){
      GetFriends();
    }
  }

  const grouped = SelectedThreadMessages.reduce((p,c)=>{
    const nk = `${c.date.toString()} ${c.from}`

    if(!p[nk]) p[nk] = [];
    
    p[nk].push(c);

    return p;
  },{} as {[name : string] : Message[]})
  const keys = Object.keys(grouped);

  function GetLatestMessage(){
    const d = keys.sort((f,d)=>{
      const p1 = Number(f.split(' ')[0]);
      const p2 = Number(f.split(' ')[0]);
      return p1 - p2;
    })
    const recent = d[-1];
    GetChatMessages(Number(d));
  }

  async function AddMember(e : FormEvent<HTMLFormElement>){
    e.preventDefault();

    const fd = new FormData(e.currentTarget);
    const body : {[name : string] : any} = {

    }

    fd.forEach((v,k)=>{
        body[k] = v;
    })

    const res = await MyFetch('/members/add',{
      method : "POST",
      body : JSON.stringify(body),
      headers : {
        'Content-Type' : 'application/json'
      }
    })

    if(res.status == 200){
      GetChatMembers();
    }
    SetShowAddChatMember(false);
  }
  async function RemoveMember(name : string){
    if(!SelectedChat) return;
    const sid = SelectedChat.id;

    const body : {[name : string] : any} = {
      id : sid,
      name : name
    }

    const res = await MyFetch('/members/remove',{
      method : "POST",
      body : JSON.stringify(body),
      headers : {
        'Content-Type' : 'application/json'
      }
    })

    if(res.status == 200){
      GetChatMembers();
    } 
  }

  return (
    <div className='Main'>
      <div className='ServerList'>
        <Display selected={!SelectedChat} tag='Home' onClick={() => SetSelectedChat(undefined)}></Display>
        <hr></hr>
        {
          ServerList && ServerList.map((itm, i) => (
            <Display selected={SelectedChat?.id == itm.id} key={i} tag={discordname(itm.name)} onClick={() => {SetSelectedMember(undefined);SetSelectedChat(itm)}}></Display>
          ))
        }
        
        <Display tag='+' onClick={()=>SetShowNewServer(true)}></Display>
      </div>
      <div className='Conversation'>
        <div className='Conversation-Scroller'>
          {
            !SelectedChat && (<>
              <button onClick={() => SetShowLogin(true)}>Login</button>
              <button onClick={()=>SetShowRegister(true)}>Register</button>
              <button onClick={Logout}>Logout</button>
              <hr></hr>
              <button onClick={()=>SetShowAddFriend(true)}>Add Friend</button>
            </>)
          }
          {
            SelectedChat && (
              <button onClick={()=>SetShowAddChatMember(true)}>Add Member</button>
            )
          }
          {
            !SelectedChat && Profile && (
              Friends.map((itm,i)=>(

                <div className='Friend' key={i}>
                  {
                    (itm.accepted && itm.to == itm.from) && <>
                      <label>{itm.to}</label>
                      <button onClick={()=>RemoveFriend(itm.to)}>x</button>
                    </> || false
                  }
                  {
                    (itm.accepted && itm.to != Profile.username) && <>
                      <label>{itm.to}</label>
                      <button onClick={()=>RemoveFriend(itm.to)}>x</button>
                    </> || false
                  }
                  {
                    itm.accepted && itm.from != Profile.username && <>
                      <label>{itm.from}</label>
                      <button onClick={()=>RemoveFriend(itm.from)}>x</button>
                    </> || false
                  }
                  {
                    !itm.accepted && itm.to == Profile.username && <>
                    <label>{`Accept? ${itm.from}`}</label>
                    <button onClick={()=>ShortAddFriend(itm.from)}>o</button>
                    <button onClick={()=>RemoveFriend(itm.from)}>x</button>
                    </>
                  }
                  {
                    !itm.accepted && itm.from == Profile.username && <>
                      <label>{`Pending ${itm.from}`}</label>
                      <button onClick={()=>RemoveFriend(itm.to)}>x</button>
                    </>
                  }
                </div>
              ))
            )
          }
          {
            SelectedChat && ServerThreads && ServerThreads.map((itm,i)=>{

              return <Display noActualHoverLight displayOnly HoverHighlight={SelectedThread?.id == itm.id} tag={itm.name} onClick={()=>SetSelectedThread(itm)} key={i}/>
            })
          }
          {
            SelectedChat && (<>
              <button className='AddThread' onClick={()=>SetShowAddThread(true)}>+</button>
            
            </>)
          }


        </div>
        <div className='Profile'>
          <Display HoverHighlight={!!Profile} background={Profile ? MediaLink(Profile.picture) : svgurl} tag='' displayOnly onClick={() => SetShowProfile(prev => !prev)} />
          <div className='Profile-desc'>
            <label>{Profile && Profile.username || "Not logged in"}</label>
            <label>{Profile ? Profile.desc : '...'}</label>
          </div>
        </div>
      </div>
      <div className='History'>
        <div className='History-List' onWheel={HandleScroll} ref={ScrollContainerRef}>
          {
            SelectedChat && SelectedThread && !SelectedThread.videochat && keys.map((itm,i)=>{
              const msgs =  grouped[itm].filter((jtm,j)=>!jtm.isfile)
              const uplds =  grouped[itm].filter((jtm,j)=>jtm.isfile)
              
              const sp = itm.split(' ');
              
              const tag = sp[1] == Profile?.username ? 'user' : 'other';
              const cn = ['MessageContainer',tag];
              const func = async (un : string)=>{
                const prof =await MyFetch(`/profile/${un}`)
                if(prof.status != 200) return console.log("no profile",un);
                return await prof.json();
              }

              const getmem = async()=>{
                const res = await func(sp[1])
                SetSelectedMember(res);
              }
              return <div className={cn.join(' ')} key={i}>
                <Display profileName={()=>func(sp[1])} onClick={getmem} HoverHighlight displayOnly/> 
                <div>
                  {
                    msgs.map((jtm,j)=>(
                      <p key={j}>{jtm.message}</p>
                    ))
                  }
                  {
                    uplds.map((jgm,j)=>(
                      <UploadDisplayFull key={j} src={MediaLink(jgm.message)}></UploadDisplayFull>
                    ))
                  }
                  <p className='small'>{(new Date(Number(sp[0])).toString())}</p>
                  </div>
                </div>
            })
          }
          {
            SelectedThread && SelectedThread.videochat && (
              <div>Is a video chat</div>
            ) || false
          }
        </div>
        {Uploads.length != 0 && (
          <div className='UploadsDisplay'>
            {MemoUploadFiles}
          </div>
        )}
        <div className='Action'>
          <button onClick={(e) => (e.currentTarget.children.item(0) as HTMLInputElement).click()}>
            +
            <input type='file' className='Upload' onChange={SelectUploadFiles} multiple />
          </button>
          <input disabled={!SelectedThread} ref={MsgRef} type='text' placeholder='Type A Message' onSubmit={() => SubmitMessage()} onKeyDown={(e) => { !e.shiftKey && e.key == 'Enter' && SubmitMessage() }} />
          <button onClick={()=>{SetSticky(true);ForceBottom()}}>{`\u{21F3}`}</button>
          <button disabled={!SelectedThread}  onClick={() => SubmitMessage()}>{`\u{21DD}`}</button>
        </div>
      </div>
      <div className='Description'>
        {
          !SelectedChat && 
          <div className='BoldProfile'>
            <Display HoverHighlight={!!Profile} background={Profile ? MediaLink(Profile.picture) : svgurl} tag='' displayOnly/>
            <div className='Profile-desc'>
              <label>{Profile && Profile.username || "Not logged in"}</label>
              <label>{Profile ? Profile.desc : '...'}</label>
            </div>
          </div>
        }
        {
          SelectedChat && SelectedMember &&
          <div className='BoldProfile'>
          <Display HoverHighlight={true} background={SelectedMember ? MediaLink(SelectedMember.picture) : svgurl} tag='' displayOnly/>
          <div className='Profile-desc'>
            <label>{SelectedMember && SelectedMember.username || "Not logged in"}</label>
            <label>{SelectedMember ? SelectedMember.desc : '...'}</label>
          </div>
        </div>
        }
        {
          SelectedChat && !SelectedMember &&
          <div className='BoldProfileEmpty'>
            <Display HoverHighlight={true}  tag={SelectedChat.name} displayOnly/>
          </div>
        }
        <hr></hr>
        {
          SelectedServerMemberList.map((itm,i)=>{

            return (
              <div className='Profile' key={i}>
                <Display onClick={()=>SetSelectedMember(itm)} HoverHighlight={true} background={itm.picture ? MediaLink(itm.picture) : ''} displayOnly/>
                <div className='Profile-desc'>
                  <label>{itm.username || "Not logged in"}</label>
                  <label>{itm.desc || '...'}</label>
                </div>
                <button onClick={()=>RemoveMember(itm.username)}>Remove</button>
              </div>
            )
          })
        }
      </div>
      {
        (ShowAddChatMember || ShowAddFriend || ShowProfile || ShowLogin || ShowNewServer || ShowRegister || ShowAddThread) && (
          <div className="modal-overlay">
            {
              false && (
                <form className='LoginForm'>
                  <label>Select Microphone</label>
                  <select>
                    {
                      MediaDevices.filter(itm => itm.kind == 'audioinput').map((itm, i) => (
                        <option key={i} value={itm.deviceId}>{`Device : ${itm.deviceId} ${itm.label}`}</option>
                      ))
                    }
                  </select>
                  <label>Select Camera</label>
                  <select>
                    {
                      MediaDevices.filter(itm => itm.kind == 'videoinput').map((itm, i) => (
                        <option key={i} value={itm.deviceId}>{`Device : ${itm.deviceId} ${itm.label}`}</option>
                      ))
                    }
                  </select>
                </form>
              )
            }
            {ShowAddFriend && (
              <form className='LoginForm' onSubmit={AddFriend}>
                <h2>Add Friend</h2>
                <label>Name</label>
                <textarea name='to' className='Outline'/>
                <input name="from" value={Profile?.username} readOnly className='Hide'/>
                <div className='form-buttons'>
                  <input type='submit' />
                  <input type='reset'></input>
                  <button type='button' onClick={()=>SetShowAddFriend(false)}>close</button>
                </div>
                
              </form>
            )}
            {ShowAddChatMember && (
              <form className='LoginForm' onSubmit={AddMember}>
                <h2>Add Member</h2>
                <label>{`Chat Name ${SelectedChat && SelectedChat.name}`}</label>
                <input readOnly value={SelectedChat && SelectedChat.id} name='id' className='Hide'/>
                <label>Name</label>
                <input name="name"  />
                <div className='form-buttons'>
                  <input type='submit' />
                  <input type='reset'></input>
                  <button type='button' onClick={()=>SetShowAddChatMember(false)}>close</button>
                </div>
                
              </form>
            )}
            {ShowProfile && (
              <form className='LoginForm' onSubmit={UpdateProfile}>
                <Display HoverHighlight={!!Profile} background={Profile ? MediaLink(Profile.picture) : svgurl} onClick={(e : any)=>{e.preventDefault(); Profile && ProfileUpload.current?.click()}} displayOnly />
                <input ref={ProfileUpload} onChange={ChangeProfilePic} type='file' accept='image/*' className='Hidden'/>
                <label>{Profile ? Profile.username : "Not Logged In"}</label>
                <textarea name='desc' defaultValue={Profile ? Profile.desc : '...'}/>
                <div className='form-buttons'>
                  <input type='submit' />
                  <input type='reset'></input>
                  <button type='button' onClick={()=>SetShowProfile(false)}>close</button>
                </div>
                
              </form>
            )}
            {ShowLogin && (
              <form className='LoginForm' onSubmit={HandleLogin}>
                <h2>Login</h2>
                <label>Username</label>
                <input type="text" name="username" required />
                <label>Password</label>
                <input type="text" name="password" required />
                <label>{LoginMessage}</label>
                <div className="form-buttons">
                  <input type="submit" value="Login" />
                  <button type="button" onClick={() => SetShowLogin(false)}>Cancel</button>
                </div>
              </form>
            )}
            {ShowNewServer && (
              <form className='LoginForm' onSubmit={HandleNewServer}>
                <h2>New Server</h2>
                <label>Name</label>
                <input type="text" name="name" required />
                <div className="form-buttons">
                  <input type="submit" value="Login" />
                  <button type="button" onClick={() => SetShowNewServer(false)}>Cancel</button>
                </div>
              </form>
            )}
            {ShowAddThread && (
              <form className='LoginForm' onSubmit={HandleNewThread}>
                <h2>New Thread</h2>
                <label>{`Server : ${SelectedChat?.name}`}</label>
                <input name='server' type='number' readOnly value={SelectedChat?.id} className='Hidden'/>
                <label>Name</label>
                <input type="text" name="name" required />
                <label>Text Chat</label>
                <input type='checkbox' defaultChecked={true} name="ischat"/>
                <div className="form-buttons">
                  <input type="submit" value="Login" />
                  <button type="button" onClick={() => SetShowAddThread(false)}>Cancel</button>
                </div>
              </form>
            )}
            {ShowRegister && (
              <form className='LoginForm' onSubmit={HandleRegister}>
                <h2>New User</h2>
                <label>Username</label>
                <input type="text" name="username" required />
                <label>Password</label>
                <input type="text" name="password" required />
                <label>Confirm-Password</label>
                <input type="text" name="confirm" required />
                <label>{RegisterMessage}</label>
                <div className="form-buttons">
                  <input type="submit" value="Register" />
                  <button type="button" onClick={() => SetShowRegister(false)}>Cancel</button>
                </div>
              </form>
            )}
          </div>
        )
      }
    </div>
  )
}

type UploadDisplayProps = {
  src : File
  onClose? : Function
}

function UploadDisplay(props : UploadDisplayProps){
  const [VideoHover,SetVideoHovering] = useState(false);
  const prefix = props.src.type.split('/')[0];
  const vidref = useRef<HTMLVideoElement>(null);


  return (
    <div className='UploadVideoContainer'>
      {prefix == 'image' && <img className='UploadVideo' src={URL.createObjectURL(props.src)}></img>} 
      {prefix == 'video' &&
        <video ref={vidref} className='UploadVideo' muted autoPlay={VideoHover} onMouseEnter={()=>vidref.current?.play()} onMouseLeave={()=>vidref.current?.pause()}>
          <source src={URL.createObjectURL(props.src)} type={props.src.type}></source>
        </video>
      }
      {(prefix != 'image' && prefix != 'video') && <object className='UploadVideo' data={URL.createObjectURL(props.src)} type={props.src.type}/>}
      <button onClick={()=>props.onClose && props.onClose()}>x</button>
    </div>
  )
}

const mime_types :{[name : string] : any} = {
  '.txt': 'text/plain',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.zip': 'application/zip',
  '.rar': 'application/x-rar-compressed',
  '.tar.gz': 'application/gzip',
  '.7z': 'application/x-7z-compressed',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.avi': 'video/x-msvideo',
  '.mov': 'video/quicktime'
}
type UploadDisplayFull = {
  src : string
  onClose? : Function,
  className ? : string,
  fromMedia? : Function
}
function UploadDisplayFull(props : UploadDisplayFull){
  const vidref = useRef<HTMLVideoElement>(null);

  const cn = ['UploadVideoFullContainer']
  if(props.className) cn.push(props.className);

  const p = props.src.split('.');
  const j = '.' + p.at(-1);

  const fullfix = mime_types[j]
  const prefix = fullfix ? fullfix.split('/')[0] : '';

  return (
    <div className={cn.join(' ')}>
      {prefix == 'image' && <img className='UploadVideo' src={props.src}></img>} 
      {prefix == 'video' &&
        <video ref={vidref} className='UploadVideo' controls>
          <source src={props.src}></source>
        </video>
      }
      {(prefix != 'image' && prefix != 'video') && <object className='UploadVideo' data={props.src}/>}
      {false && <button onClick={()=>props.onClose && props.onClose()}>x</button>}
    </div>
  )
}



type DisplayProps = {
  tag? : string,
  onClick ? : Function,
  selected ? : boolean,
  background ? : string,
  displayOnly ? : boolean,
  HoverHighlight? : boolean,
  noActualHoverLight? : boolean,
  noHover? : boolean,
  profileName? : ()=>Promise<Profile>
}

function Display(props : DisplayProps){

  const [classes,SetClasses] = useState<string[]>(['Display']);
  const idref = useRef<number | null>(null);
  const [profImage,SetProfImage] = useState<string>('');
  
  useEffect(()=>{
    if(!props.profileName) return;
    props.profileName().then((res)=>{
      SetProfImage(MediaLink(res.picture))
    }).catch((e)=>{
      SetProfImage('')
    })
  },[props.profileName])

  function addremclass(add:string[],rem:string[]){
    if(props.displayOnly) return;

    SetClasses(prev=>{
      const copy = prev.filter(data=>!rem.includes(data));
      const added = Array.from(new Set([...copy,...add]))

      return added

    })
  }
  const mleave = ()=>{
    if(props.noHover) return;
    addremclass(['Unhover'],['Hover'])
    const timenum = setTimeout(() => {
      addremclass([],['Unhover','Hover'])
    }, 400);
    idref.current = Number(timenum)
  }

  const mover = ()=>{
    if(props.noHover) return;
    addremclass(['Hover'],['Unhover'])

    if(idref.current != null){
      clearTimeout(idref.current);
    }
  }

  let displayname = classes.join(' ')
  if(props.selected && !props.displayOnly){
    displayname = ['Selected',displayname].join(' ');
  }
  if(props.displayOnly){
    displayname = ['DisplayOnly',displayname].join(' ');
  }
  if(props.HoverHighlight){
    displayname = ['HoverHighlight',displayname].join(' ');
    if(props.noActualHoverLight){
      displayname = ['NoActualHoverLight',displayname].join(' ');
    }
  }

  
  if(props.noHover){
    displayname = ['NoHover',displayname].join(' ');
  }

  const backstyle : React.CSSProperties = {
    backgroundImage : `url(${profImage || props.background})`,
    backgroundSize : 'cover',
    backgroundRepeat : 'no-repeat',
    backgroundPosition : 'center'
  } 
  return (
    <div className={displayname} onMouseOver={mover} onMouseLeave={mleave} >
      <div className='Clipping' style={backstyle}>
        <button onClick={(e)=>props.onClick && props.onClick(e)}>{props.background ? '' : props.tag}</button>
      </div>
      
    </div>
  )
}

type ExpandingListProps = {
  defaultExpanded? : boolean
  desc? : string
} & React.PropsWithChildren

function ExpandingList(props : ExpandingListProps){
  const [Expanded,SetExpanded] = useState<boolean>(!!props.defaultExpanded);

  let aname = 'ExpandingList';
  if(Expanded){
    aname = [aname,'Expanded'].join(' ');
  }

  return (
    <div className={aname}>
      <div className='ExpandingList-body'>
        {props.children}
      </div>
      <button>{props.desc}</button>
    </div>
  )
}
function MediaLink(dest : string){
  let prefix = import.meta.env.VITE_SERVER;
  prefix = prefix ? prefix : '';
  
  return `${prefix}/media/${dest}`
}  
export default App

