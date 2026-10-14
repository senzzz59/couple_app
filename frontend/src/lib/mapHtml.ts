/**
 * 足迹地图：在 WebView / iframe 里跑高德 JS API 2.0。
 * 与 RN 之间用 postMessage 通讯：
 *   地图 → RN：{type:'ready'} {type:'select', id} {type:'error', message}
 *   RN → 地图：window.__cmd({type:'points', points}) / ({type:'focus', id})
 */
export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  status: 'want' | 'visited';
  emoji: string;
}

export function buildMapHtml(key: string, securityCode: string) {
  return `<!doctype html><html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
  html,body,#map{margin:0;padding:0;height:100%;width:100%;background:#FAF6F0;font-family:-apple-system,sans-serif}
  .amap-logo,.amap-copyright{opacity:.5}
  .wrap{animation:drop .6s cubic-bezier(.2,1.4,.4,1) both}
  .pin{width:38px;height:38px;border-radius:19px 19px 19px 5px;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;
       box-shadow:0 6px 14px rgba(58,42,26,.18);transition:transform .25s cubic-bezier(.2,1.4,.4,1)}
  .pin span{transform:rotate(45deg);font-size:18px;line-height:1}
  .visited{background:#F06A5B;border:2.5px solid #fff}
  .want{background:#fff;border:2px dashed #E0A13A}
  .sel{transform:rotate(-45deg) scale(1.3)}
  @keyframes drop{0%{transform:translateY(-40px) scale(.3);opacity:0}100%{transform:none;opacity:1}}
</style>
<script>window._AMapSecurityConfig={securityJsCode:${JSON.stringify(securityCode)}};</script>
<script src="https://webapi.amap.com/loader.js"></script>
</head><body><div id="map"></div>
<script>
  var map=null, A=null, markers={}, els={}, pending=[];
  function send(m){var s=JSON.stringify(m); if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(s)} else {window.parent.postMessage(s,'*')}}
  function select(id){Object.keys(els).forEach(function(k){els[k].classList.toggle('sel',k===id)})}
  function render(points){
    Object.keys(markers).forEach(function(k){markers[k].setMap(null)}); markers={}; els={};
    points.forEach(function(p,i){
      var wrap=document.createElement('div'); wrap.className='wrap'; wrap.style.animationDelay=(i*55)+'ms';
      var pin=document.createElement('div'); pin.className='pin '+(p.status==='visited'?'visited':'want');
      var em=document.createElement('span'); em.textContent=p.emoji; pin.appendChild(em); wrap.appendChild(pin);
      var m=new A.Marker({position:[p.lng,p.lat],content:wrap,anchor:'bottom-center',offset:new A.Pixel(0,-4)});
      m.on('click',function(){select(p.id); map.setCenter(m.getPosition(),false,400); send({type:'select',id:p.id})});
      m.setMap(map); markers[p.id]=m; els[p.id]=pin;
    });
    var list=Object.keys(markers).map(function(k){return markers[k]});
    if(list.length===1){map.setZoomAndCenter(15,list[0].getPosition())}
    else if(list.length){map.setFitView(list,false,[70,50,50,50],16)}
  }
  window.__cmd=function(c){
    if(!map){pending.push(c);return}
    if(c.type==='points')render(c.points);
    if(c.type==='focus'&&markers[c.id]){select(c.id);map.setZoomAndCenter(16,markers[c.id].getPosition(),false,500)}
  };
  function onMsg(e){try{var c=typeof e.data==='string'?JSON.parse(e.data):e.data; if(c&&c.type)window.__cmd(c)}catch(err){}}
  window.addEventListener('message',onMsg); document.addEventListener('message',onMsg);
  AMapLoader.load({key:${JSON.stringify(key)},version:'2.0'}).then(function(AMap){
    A=AMap;
    map=new AMap.Map('map',{zoom:12,viewMode:'2D',mapStyle:'amap://styles/whitesmoke',resizeEnable:true});
    map.on('click',function(){select(null);send({type:'select',id:null})});
    send({type:'ready'}); pending.splice(0).forEach(window.__cmd);
  }).catch(function(e){send({type:'error',message:String(e&&e.message||e)})});
</script></body></html>`;
}
