(function anonymous(Reader,types,util
) {
return function _Virtual$decode(r,l) {
	if(!(r instanceof Reader))
		r=Reader.create(r)
	var c=l===undefined?r.len:r.pos+l,m=new this.ctor
	while(r.pos<c){
		var t=r.uint32()
		switch(t>>>3){
			case 1:
				m["seatId"]=r.int32()
				break
			case 2:
				m["userName"]=r.string()
				break
			case 3:
				m["currency"]=r.string()
				break
			case 4:
				m["betInfo"]=r.string()
				break
			case 5:
				m["balance"]=r.double()
				break
			case 6:
				m["type"]=r.int32()
				break
			case 7:
				m["mid"]=r.uint64()
				break
			case 8:
				m["streak"]=r.uint32()
				break
			case 9:
				m["betNum"]=r.uint64()
				break
			case 10:
				m["winNum"]=r.uint64()
				break
			case 11:
				m["head"]=r.string()
				break
			case 12:
				m["deviceType"]=r.uint32()
				break
			case 13:
				if(!(m["list"]&&m["list"].length))
					m["list"]=[]
				m["list"].push(r.string())
				break
			default:
				r.skipType(t&7)
				break
		}
	}
	return m
}
})