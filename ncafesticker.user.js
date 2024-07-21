// ==UserScript==
// @name        Naver cafe sticker for PC
// @match       *://cafe.naver.com/*
// @grant       GM.getValue
// @grant       GM.setValue
// @run-at      document-idle
// @require     https://cdn.jsdelivr.net/npm/@violentmonkey/url
// @version     1.0
// @author      웡웡이
// ==/UserScript==

const config = {};

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

clearStickerList = async ()=>{
  const reply = confirm(`모든 스티커를 삭제합니다. 계속하시겠습니까?`);
  if(reply) {
    await await GM.setValue('sticker', []);
    console.info(`삭제 완료`);
    return;
  }
  console.info(`사용자가 삭제를 취소함`);
};

function detectMime(arr){
  const mimes = [
    {
      mime: 'image/bmp',
      magic: '424d',
    },
    {
      mime: 'image/png',
      magic: '89504e47',
    },
    {
      mime: 'image/jpeg',
      magic: 'ffd8ffe0',
    },
    {
      mime: 'image/gif',
      magic: '47494638',
    },
  ];
  arr = new Uint8Array(arr).subarray(0, 4);
  let header = '';
  for(var i = 0; i < arr.length; i++) {
    header += arr[i].toString(16);
  }
  for(let mime of mimes) {
    if(header.startsWith(mime.magic)){
      return mime.mime;
    }
  }
  // failback for naver cafe
  return 'image/gif';
}

function decodeBase64(data) {
  return Uint8Array.from(Array.from(atob(data)).map(e => e.charCodeAt(0)));;
}

function dataurlToFile(url, filename){
  let content = decodeBase64(url.split(',')[1]);
  return new File([content], filename, {type:detectMime(content)});
}

async function addSticker() {
  var input = document.createElement('input');
  input.type = 'file';
  input.setAttribute('accept', 'application/json');
  input.onchange = e => {
    var file = e.target.files[0];
    var reader = new FileReader();
    reader.readAsText(file,'UTF-8');
    reader.onload = async e => {
      try{
        var content = JSON.parse(e.target.result);
        if(!content || !content.info || typeof content.info !== 'object' || !content.stickers || !content.stickers.length){
          throw '파일이 스티커 형식이 아닌 것 같습니다';
        }
        const stickers = await GM.getValue('sticker', []);
        stickers.push(content);
        await GM.setValue('sticker', stickers);
        await showStickers();
        await showStickers();
      } catch(e){
        alert('올바른 형식이 아닙니다!', e);
      }
    }
  }
  input.click();
}

function updateStickerBar(){
  const stickers = Array.from(document.querySelector('.se2_line_sticker_set').childNodes);
  let notElement = 0;
  for(const [index, sticker] of stickers.entries()) {
    if(!(sticker instanceof Element)) {
      notElement ++;
      continue;
    }
    if(index - notElement >= config.page * 16 && index - notElement < (config.page + 1) * 16) {
      sticker.childNodes[0].style.display = '';
    }
    else {
      sticker.childNodes[0].style.display = 'none';
    }
  }
}

function updatePageButton() {
  let elementCount = 0;
  for(const [index, sticker] of Array.from(document.querySelector('.se2_line_sticker_set').childNodes).entries()) {
    if(sticker instanceof Element) {
      elementCount++;
    }
  }
  const maxPage = Math.floor(elementCount / 16);
  if(config.page < 0) {
    config.page = 0;
  }
  if(config.page > maxPage) {
     config.page = maxPage;
  }
  let next = document.querySelector('.se2_next');
  // when next button is enabled
  if(next && config.page == maxPage) {
    next.className = 'se2_next_off';
    next.disabled = 'disabled';
  }
  // when next button is disabled
  else if(!next && config.page < maxPage) {
    next = document.querySelector('.se2_next_off');
    next.className = 'se2_next';
    next.disabled = null;
  }
  let prev = document.querySelector('.se2_prev');
  if(prev && config.page <= 0) {
    prev.className = 'se2_prev_off';
    prev.disabled = 'disabled';
  }
  else if(!prev && config.page > 0) {
    prev = document.querySelector('.se2_prev_off')
    prev.className = 'se2_prev';
    prev.disabled = null;
  }
}

async function showStickers(){
  if(document.querySelector('._btn_shop')){
    // hide Line sticker layout
    document.querySelector('.button_sticker').click();
    await sleep(100);
  }
  if(document.getElementById('stickerbox')) {
    document.querySelector('.attach_box').removeChild(document.getElementById('stickerbox'));
    return;
  }
  const l1 = document.createElement('div');
  const l2 = document.createElement('div');
  const l3 = document.createElement('div');
  const stickerBox = document.createElement('div');
  l1.id = 'stickerbox';
  l1.className = 'CommentLineSticker';
  l2.className = 'se2_line_layer';
  l3.className = 'se2_in_layer';
  stickerBox.className = 'se2_line_sticker';
  stickerBox.innerHTML = `
<div class="se2_line_sticker">
  <button type="button" title="이전" class="se2_prev">
    <span>이전</span>
  </button>
  <ul class="se2_line_sticker_set">
  </ul>
  <button type="button" title="다음" class="se2_next">
    <span>다음</span>
  </button>
</div>
  `;
  l3.appendChild(stickerBox);
  l2.appendChild(l3);
  l1.appendChild(l2);
  document.querySelector('.attach_box').appendChild(l1);
  const stickerSetElement = document.querySelector('.se2_line_sticker_set');
  const stickerElements = [];
  const stickers = await GM.getValue('sticker', []);
  for(let sticker of stickers) {
    const stickerElement = document.createElement('li');
    const stickerBtn = document.createElement('button');
    const stickerListElement = document.createElement('div');
    const stickerListUlElement = document.createElement('ul');
    stickerBtn.type = 'button';
    stickerBtn.innerHTML = `<img src="${sticker.info.thumbnail}" height="26px"/>`;
    stickerBtn.addEventListener('click', function(e) {
      Array.from(this.parentElement.parentElement.childNodes).map(e=>{
        if(e instanceof Element) {
          e.className="";
        }
      });
      this.parentElement.className = 'active';
    });
    stickerListElement.className = 'se2_linesticker_list';
    for(let stickerItem of sticker.stickers) {
      let li = document.createElement('li');
      li.style.background = 'unset';
      li.innerHTML = `<button type="button" style="background: unset;"><img src="${stickerItem.image}" height="100px"/></button>`;
      li.addEventListener('mouseover', function(){this.style.background="#EEEEEE";});
      li.addEventListener('mouseout', function(){this.style.background="unset";});
      li.addEventListener('click', function(){
        const dataTransfer = new DataTransfer();
        const attachElement = document.getElementById('attach2');
        attachElement.dispatchEvent(new Event('click'));
        attachElement.files = dataTransfer.files;
        dataTransfer.items.add(dataurlToFile(this.querySelector('img').src, '웡.gif'));
        attachElement.files = dataTransfer.files;
        attachElement.dispatchEvent(new Event('change'));
        showStickers();
      });
      stickerListUlElement.appendChild(li);
    }

    stickerElement.appendChild(stickerBtn);

    stickerListElement.appendChild(stickerListUlElement);
    stickerElement.appendChild(stickerListElement);

    stickerSetElement.appendChild(stickerElement);
    stickerElements.push(stickerElement);
  }
  const addStickerBtn = document.createElement('li');
  addStickerBtn.innerHTML = `<button type="button" id="addsticker">
  <svg xmlns="http://www.w3.org/2000/svg" width="26px" height="26px" viewBox="0 0 24 24" fill="none">
<path d="M20 14V7C20 5.34315 18.6569 4 17 4H12M20 14L13.5 20M20 14H15.5C14.3954 14 13.5 14.8954 13.5 16V20M13.5 20H7C5.34315 20 4 18.6569 4 17V12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M7 4V7M7 10V7M7 7H4M7 7H10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
</button>`;
  stickerSetElement.appendChild(addStickerBtn);
  document.getElementById('addsticker').addEventListener('click', addSticker);
  stickerElements.push(addStickerBtn);
  if(!config.page) {
    config.page = 0;
  }
  updateStickerBar();
  document.querySelector('.se2_prev').addEventListener('click', async function(){
    config.page--;
    updatePageButton();
    updateStickerBar();
  });
  document.querySelector('.se2_next').addEventListener('click', async function(){
    config.page++;
    updatePageButton();
    updateStickerBar();
  });
  stickerElements[0].childNodes[0].click();
  updatePageButton();
}

const handleNavigate = async () => {
  if(!/^\/ca-fe\/cafes\/\d+\/articles\/\d+$/.test(window.location.pathname)){
    return;
  }
  if(!document.querySelector('.attach_box')) {
    while(!document.querySelector('.attach_box')) {
      await sleep(1000);
    }
  }
  // race condition
  if(document.getElementById('shelterstickerbtn')) {
    return;
  }
  document.querySelector('.button_sticker').addEventListener('click', ()=>document.getElementById('stickerbox')&&document.querySelector('.attach_box').removeChild(document.getElementById('stickerbox')));
  const attachBox = document.querySelector('.attach_box');
  const btn = document.createElement('a');
  btn.style['margin-left'] = '16px';
  btn.id = 'shelterstickerbtn';
  btn.className = 'button_sticker';
  btn.setAttribute('role', 'button');
  btn.setAttribute('href', '#');
  btn.innerHTML = `
  <svg xmlns="http://www.w3.org/22000/svg" height="17px" viewBox="0 0 24 24" fill="none">
  <path d="M9 16C9.85038 16.6303 10.8846 17 12 17C13.1154 17 14.1496 16.6303 15 16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <ellipse cx="15" cy="10.5" rx="1" ry="1.5" fill="currentColor"/>
  <ellipse cx="9" cy="10.5" rx="1" ry="1.5" fill="currentColor"/>
  <path d="M15 22H12C7.28595 22 4.92893 22 3.46447 20.5355C2 19.0711 2 16.714 2 12C2 7.28595 2 4.92893 3.46447 3.46447C4.92893 2 7.28595 2 12 2C16.714 2 19.0711 2 20.5355 3.46447C21.5093 4.43821 21.8356 5.80655 21.9449 8M15 22C18.866 22 22 18.866 22 15M15 22C15 20.1387 15 19.2081 15.2447 18.4549C15.7393 16.9327 16.9327 15.7393 18.4549 15.2447C19.2081 15 20.1387 15 22 15M22 12V15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  </svg>`;
  btn.addEventListener('click', e=>(showStickers(),e.preventDefault()));
  attachBox.appendChild(btn);
};

VM.onNavigate(handleNavigate);
