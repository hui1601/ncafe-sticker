// ==UserScript==
// @name        Shlter sticker downloder
// @match       https://shelter.id/*
// @grant       none
// @version     1.1
// @require     https://cdn.jsdelivr.net/npm/@violentmonkey/url
// @author      웡웡이
// ==/UserScript==
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// function getRefreshToken(){
//   return new Promise(res=>{
//     if(getRefreshToken.cache) {
//       res(getRefreshToken.cache);
//     }
//     indexedDB.open("firebaseLocalStorageDb").onsuccess = function(ev) {
//       const storage = ev.target.result.transaction('firebaseLocalStorage').objectStore('firebaseLocalStorage');
//       storage.getAllKeys().onsuccess = function(e) {
//         storage.get(e.target.result[0]).onsuccess = function(e) {
//           getRefreshToken.cache = e.target.result.value.stsTokenManager.refreshToken;
//           res(e.target.result.value.stsTokenManager.refreshToken);
//         }
//       }
//     };
//   })
// }

// function getToken(){
//   return new Promise(async res=>{
//     if(getToken.cache && getToken.cache.timeout < Date.now()) {
//       res(getToken.cache.token);
//     }
//     const refreshToken = await getRefreshToken();
//     const token = await(await fetch('https://securetoken.googleapis.com/v1/token?key=AIzaSyCzeBduftRqigBli1pZJlI3BAduXxCFCrg',{
//       method: 'POST',
//       headers:{
//         'Content-Type': 'application/x-www-form-urlencoded'
//       },
//       body: new URLSearchParams({
//         grant_type: 'refresh_token',
//         refresh_token: refreshToken,
//       })
//     })).json();
//     getToken.cache = {
//       token: token.access_token,
//       timeout: Date.now + parseInt(token.expires_in, 10) * 1000
//     };
//     return token.access_token;
//   });
// }

async function downloadText(name, content) {
  let a = document.createElement('a');
  a.style.display = 'none';
  a.setAttribute('download', name);
  a.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(content));
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}


// https://stackoverflow.com/a/71604665
async function getImage(url) {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((onSuccess, onError) => {
    try {
      const reader = new FileReader() ;
      reader.onload = function(){ onSuccess(this.result) } ;
      reader.readAsDataURL(blob) ;
    } catch(e) {
      onError(e);
    }
  });
};


VM.onNavigate(async () => {
  await sleep(500);
  let check = location.pathname.split('modal:_');
  if(document.getElementById('ncafedownbtn')) {
    document.querySelector("app-product-content-viewer").removeChild(document.getElementById('ncafedownbtn'));
  }
  if(check.length == 2){
    let path = check[1].slice(0, -1)
    if(path.startsWith('/product/id/')){
      let productId = parseInt(path.replace('/product/id/', ''), 10);
      while(!document.querySelector("app-product-content-viewer")) await sleep(300);
      document.querySelector("app-product-content-viewer").innerHTML += `
      <button id="ncafedownbtn" class="btn-primary" style="padding: .3125rem .625rem;font-size: .875rem;display: block;margin: 10px auto;"><b><fa-icon class="ng-fa-icon c_white" style="color: #fff;"><svg role="img" aria-hidden="true" focusable="false" data-prefix="fas" data-icon="download" class="svg-inline--fa fa-download" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill="currentColor" d="M288 32c0-17.7-14.3-32-32-32s-32 14.3-32 32V274.7l-73.4-73.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l128 128c12.5 12.5 32.8 12.5 45.3 0l128-128c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L288 274.7V32zM64 352c-35.3 0-64 28.7-64 64v32c0 35.3 28.7 64 64 64H448c35.3 0 64-28.7 64-64V416c0-35.3-28.7-64-64-64H346.5l-45.3 45.3c-25 25-65.5 25-90.5 0L165.5 352H64zm368 56a24 24 0 1 1 0 48 24 24 0 1 1 0-48z"></path></svg></fa-icon><span class="to-collect" style="margin-left: 3px;">네이버 카페 형식으로 다운로드</span></b></button>
      `;
      document.getElementById('ncafedownbtn').addEventListener('click',async function(e) {
        document.getElementById('ncafedownbtn').disabled = true;
        const stickerInfo = await (await fetch(`https://rest.shelter.id/v1.0/products/${productId}`)).json();
        const saveStickerInfo = {
          info: {
            id: stickerInfo.id,
            name: stickerInfo.name,
            description: stickerInfo.summary,
            thumbnail: await getImage(stickerInfo.emoticon_image),
          },
          stickers: [],
        };
        for(let sticker of stickerInfo.emoticon_content_list) {
          saveStickerInfo.stickers.push({
            id: sticker.id,
            image: await getImage(sticker.content),
          });
        }
        downloadText(`${stickerInfo.name}.json`, JSON.stringify(saveStickerInfo));
        document.getElementById('ncafedownbtn').disabled = false;
      });
    }
  }
});
