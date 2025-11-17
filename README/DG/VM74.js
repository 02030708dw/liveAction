(function anonymous(Reader,types,util
) {
return function _Table$decode(r,l) {
	if(!(r instanceof Reader))
		r=Reader.create(r)
	var c=l===undefined?r.len:r.pos+l,m=new this.ctor
	while(r.pos<c){
		var t=r.uint32()
		switch(t>>>3){
			case 1:
				m["tableId"]=r.uint32()
				break
			case 2:
				m["shoeId"]=r.uint64()
				break
			case 3:
				m["playId"]=r.uint64()
				break
			case 4:
				m["state"]=r.int32()
				break
			case 5:
				m["countDown"]=r.int32()
				break
			case 6:
				m["result"]=r.string()
				break
			case 7:
				m["poker"]=r.string()
				break
			case 8:
				if(!(m["tel"]&&m["tel"].length))
					m["tel"]=[]
				m["tel"].push(r.string())
				break
			case 9:
				if(!(m["ext"]&&m["ext"].length))
					m["ext"]=[]
				m["ext"].push(r.string())
				break
			case 10:
				if(!(m["roads"]&&m["roads"].length))
					m["roads"]=[]
				m["roads"].push(r.string())
				break
			case 11:
				m["gameNo"]=r.string()
				break
			case 12:
				m["fms"]=r.string()
				break
			case 13:
				m["tableName"]=r.string()
				break
			case 14:
				m["vipName"]=r.string()
				break
			case 15:
				m["totalAmount"]=r.int32()
				break
			case 16:
				m["onlineCount"]=r.int32()
				break
			case 17:
				m["dealer"]=types[16].decode(r,r.uint32())
				break
			case 18:
				m["gameId"]=r.int32()
				break
			case 19:
				m["anchor"]=types[18].decode(r,r.uint32())
				break
			default:
				r.skipType(t&7)
				break
		}
	}
	return m
}
})