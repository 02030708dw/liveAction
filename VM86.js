(function anonymous(Reader,types,util
) {
return function _PublicBean$decode(r,l) {
	if(!(r instanceof Reader))
		r=Reader.create(r)
	var c=l===undefined?r.len:r.pos+l,m=new this.ctor
	while(r.pos<c){
		var t=r.uint32()
		switch(t>>>3){
			case 1:
				m["cmd"]=r.int32()
				break
			case 2:
				m["token"]=r.string()
				break
			case 3:
				m["codeId"]=r.int32()
				break
			case 4:
				m["lobbyId"]=r.int32()
				break
			case 5:
				m["gameNo"]=r.string()
				break
			case 6:
				m["tableId"]=r.int32()
				break
			case 7:
				m["seat"]=r.int32()
				break
			case 8:
				m["mid"]=r.int64()
				break
			case 9:
				if(!(m["dList"]&&m["dList"].length))
					m["dList"]=[]
				if((t&7)===2){
					var c2=r.uint32()+r.pos
					while(r.pos<c2)
						m["dList"].push(r.double())
				}else
					m["dList"].push(r.double())
				break
			case 10:
				m["type"]=r.int32()
				break
			case 11:
				m["userName"]=r.string()
				break
			case 12:
				if(!(m["list"]&&m["list"].length))
					m["list"]=[]
				m["list"].push(r.string())
				break
			case 13:
				if(!(m["mids"]&&m["mids"].length))
					m["mids"]=[]
				if((t&7)===2){
					var c2=r.uint32()+r.pos
					while(r.pos<c2)
						m["mids"].push(r.int64())
				}else
					m["mids"].push(r.int64())
				break
			case 14:
				m["object"]=r.string()
				break
			case 15:
				if(!(m["virtual"]&&m["virtual"].length))
					m["virtual"]=[]
				m["virtual"].push(types[14].decode(r,r.uint32()))
				break
			case 16:
				if(!(m["lobbyPush"]&&m["lobbyPush"].length))
					m["lobbyPush"]=[]
				m["lobbyPush"].push(types[15].decode(r,r.uint32()))
				break
			case 17:
				if(!(m["table"]&&m["table"].length))
					m["table"]=[]
				m["table"].push(types[16].decode(r,r.uint32()))
				break
			default:
				r.skipType(t&7)
				break
		}
	}
	if(!m.hasOwnProperty("cmd"))
		throw util.ProtocolError("missing required 'cmd'",{instance:m})
	return m
}
})