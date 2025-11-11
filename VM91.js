(function anonymous(Reader,types,util
) {
return function _LobbyPush$decode(r,l) {
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
				m["onlineCount"]=r.uint64()
				break
			case 3:
				m["totalAmount"]=r.uint64()
				break
			case 4:
				m["vipName"]=r.string()
				break
			case 5:
				m["seatFull"]=r.bool()
				break
			default:
				r.skipType(t&7)
				break
		}
	}
	return m
}
})