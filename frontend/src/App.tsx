import React, { HTMLInputAutoCompleteAttribute, useEffect, useMemo, useRef, useState } from 'react'
import svgurl from './assets/react.svg'
import './App.css'


function App() {
  const [SelectedChat,SetSelectedChat] = useState("home");// left panel
  const [InspectUser,SetInspectUser] = useState<string | undefined>();//click on user profile -> show on right
  const [ServerList,SetServerList] = useState<string[]>(['Server 1','Server 2'])//server list,clicking set selected chat
  
  const [ShowProfile,SetShowProfile] = useState(false); //login/logout stuff
  const [Friends,SetFriends] = useState([])//friends list
  const [Uploads,SetUploads] = useState<File[]>([]);
  const [MediaDevices,SetMediaDevices] = useState<Array<InputDeviceInfo | MediaDeviceInfo>>([]);

  const MsgRef = useRef<HTMLInputElement>(null);

  //check for new devices to hit the 
  useEffect(()=>{
    const intervalnum = setInterval(() => {
      const md = navigator.mediaDevices.enumerateDevices();
      md.then((res)=>{
        SetMediaDevices(res);
      })
    }, (5000));

    return ()=>{
      clearInterval(intervalnum);
    }
  },[])


  function UpdateProfile(e : React.FormEvent<HTMLFormElement>){
    e.preventDefault();
    SetShowProfile(false);
  }

  function SelectUploadFiles(e: React.ChangeEvent<HTMLInputElement>){
    
    if(!e.target.files) return;
    const vals = Array.from(e.target.files);

    SetUploads(prev=>[...prev,...vals]);

  }

  //dont rerender every uploaded file on chanage. I'm not sure if this causes problems
  const MemoUploadFiles = useMemo(()=>Uploads.map((itm,i)=>(
      <UploadDisplay key={i} src={itm} onClose={()=>SetUploads(prev=>prev.filter((j,k)=>k!=i))}/>
  )),[Uploads])

  function SubmitMessage(){
    const targ = MsgRef.current;
    if(!targ) return;

    targ.value = '';
    SetUploads([]);
  }

  

  return (
    <div className='Main'>
      <div className='ServerList'>
        <Display tag='Home' onClick={()=>SetSelectedChat('home')}></Display>
        <hr></hr>

        {
          ServerList.map((itm,i)=>(
            <Display background={svgurl} key={i} tag={itm} onClick={()=>SetSelectedChat(itm)}></Display>
          ))
        }

      </div>
      <div className='Conversation'>
        <div className='Conversation-Scroller'>
          {
            SelectedChat == 'home' &&(<>
              <button>Login</button>
              <button>Logout</button>
            </>)
          }
        </div>
        <div className='Profile'>
          <Display background={svgurl} tag='' displayOnly onClick={()=>SetShowProfile(prev=>!prev)}/>
          <div className='Profile-desc'>
            <label>name</label>
            <label>desc</label>
          </div>

        </div>
      </div>
      <div className='History'>
        <div className='History-List'>
          
        </div>
        
        {Uploads.length != 0 && (
            <div className='UploadsDisplay'>
              {
                MemoUploadFiles
              }
            </div>
          )
        }
        <div className='Action'>
          <button onClick={(e)=>(e.currentTarget.children.item(0) as HTMLInputElement).click()}>
            +
            <input type='file' className='Upload' onChange={SelectUploadFiles} multiple/>
          </button>
          <input ref={MsgRef} type='text' placeholder='Type A Message' onSubmit={()=>SubmitMessage()} onKeyDown={(e)=>{!e.shiftKey && e.key == 'Enter' && SubmitMessage()}}/>
          <button onClick={()=>SubmitMessage()}>{`\u{21DD}`}</button>
        </div>
      </div>
      <div className='Description'>


      </div>
      {
          ShowProfile && (

            <form className='ProfileForm' onSubmit={UpdateProfile}>
              <Display background={svgurl} displayOnly/>
              <label>Name</label>
              <label>Desc</label>
              <label>Select Microphone</label>
              <select>
                {
                  MediaDevices.filter(itm=>itm.kind == 'audioinput').map((itm,i)=>(
                    <option key={i} value={itm.deviceId}>{`Device : ${itm.deviceId} ${itm.label}`}</option>
                  ))
                }
              </select>
              <label>Select Camera</label>
              <select>
                {
                  MediaDevices.filter(itm=>itm.kind == 'videoinput').map((itm,i)=>(
                    <option key={i} value={itm.deviceId}>{`Device : ${itm.deviceId} ${itm.label}`}</option>
                  ))
                }
              </select>

              <input type='submit'/>
              <input type='reset'></input>
            </form>
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


type DisplayProps = {
  tag? : string,
  onClick ? : Function,
  selected ? : boolean,
  background ? : string,
  displayOnly ? : boolean
}

function Display(props : DisplayProps){

  const [classes,SetClasses] = useState<string[]>(['Display']);
  const idref = useRef<number | null>(null);
  
  function addremclass(add:string[],rem:string[]){
    if(props.displayOnly) return;

    SetClasses(prev=>{
      const copy = prev.filter(data=>!rem.includes(data));
      const added = Array.from(new Set([...copy,...add]))

      return added

    })
  }
  const mleave = ()=>{
    addremclass(['Unhover'],['Hover'])
    const timenum = setTimeout(() => {
      addremclass([],['Unhover','Hover'])
    }, 400);
    idref.current = Number(timenum)
  }

  const mover = ()=>{
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

  const backstyle : React.CSSProperties = {
    backgroundImage : `url(${props.background})`,
    backgroundSize : 'contain',
    backgroundRepeat : 'no-repeat',
    backgroundPosition : 'center'
  } 
  return (
    <div className={displayname} onMouseOver={mover} onMouseLeave={mleave} >
      <div className='Clipping' style={backstyle}>
        <button onClick={()=>props.onClick && props.onClick()}>{props.background ? '' : props.tag}</button>
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

export default App

