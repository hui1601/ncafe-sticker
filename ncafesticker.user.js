// ==UserScript==
// @name        Naver cafe sticker for PC
// @match       *://cafe.naver.com/*
// @grant       GM.getValue
// @grant       GM.setValue
// @run-at      document-body
// @version     1.4
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


async function addSticker(success){
  let input = document.createElement('input');
  input.type = 'file';
  input.setAttribute('accept', 'application/json');
  input.onchange = function(e) {
    var file = e.target.files[0];
    var reader = new FileReader();
    reader.readAsText(file,'UTF-8');
    reader.onload = async function(e) {
      try{
        var content = JSON.parse(e.target.result);
        if(!content || !content.info || typeof content.info !== 'object' || !content.stickers || !content.stickers.length){
          throw '파일이 스티커 형식이 아닌 것 같습니다';
        }
        const stickers = await GM.getValue('sticker', []);
        const idConflict = stickers.filter(function(e){return content.info.id == e.info.id;});
        if(idConflict.length) {
           if(!confirm(`${content.info.name}(${content.info.id})은(는) 이미 ${idConflict.map((e)=>e.info.name + "(" + e.info.id + ")").join(', ')}(으)로 추가되어있습니다.\n계속하시겠습니까?`)) {
             return;
           }
        }
        stickers.push(content);
        await GM.setValue('sticker', stickers);
        success();
      } catch(e){
        console.error(e);
        alert('올바른 형식이 아닙니다!');
      }
    }
  }
  input.click();
}

const commentInjection = {
  config: {},
  addSticker: async function() {
    addSticker(commentInjection.showStickers);
  },
  updateStickerBar: function() {
    const stickers = Array.from(document.querySelector('.se2_line_sticker_set').childNodes);
    let notElement = 0;
    for(const [index, sticker] of stickers.entries()) {
      // ignore text element
      if(!(sticker instanceof Element)) {
        notElement ++;
        continue;
      }
      if(index - notElement >= commentInjection.config.page * 16 && index - notElement < (commentInjection.config.page + 1) * 16) {
        sticker.childNodes[0].style.display = '';
      }
      else {
        sticker.childNodes[0].style.display = 'none';
      }
    }
  },
  updatePageButton: function() {
    let elementCount = 0;
    for(const sticker of Array.from(document.querySelector('.se2_line_sticker_set').childNodes)) {
      if(sticker instanceof Element) {
        elementCount++;
      }
    }
    const maxPage = Math.floor(elementCount / 16);
    if(commentInjection.config.page < 0) {
      commentInjection.config.page = 0;
    }
    if(commentInjection.config.page > maxPage) {
      commentInjection.config.page = maxPage;
    }
    let next = document.querySelector('.se2_next');
    // when next button is enabled
    if(next && commentInjection.config.page == maxPage) {
      next.className = 'se2_next_off';
      next.disabled = 'disabled';
    }
    // when next button is disabled
    else if(!next && commentInjection.config.page < maxPage) {
      next = document.querySelector('.se2_next_off');
      next.className = 'se2_next';
      next.disabled = null;
    }
    let prev = document.querySelector('.se2_prev');
    if(prev && commentInjection.config.page <= 0) {
      prev.className = 'se2_prev_off';
      prev.disabled = 'disabled';
    }
    else if(!prev && commentInjection.config.page > 0) {
      prev = document.querySelector('.se2_prev_off')
      prev.className = 'se2_prev';
      prev.disabled = null;
    }
  },
  showStickers: async function showStickers(stickerButton){
    if(document.querySelector('._btn_shop')){
      document.querySelector('.button_sticker').click();
      while(document.querySelector('._btn_shop')) await sleep(10);
    }
    const existingStickerLayer = document.querySelector('.custom_sticker_layer');
    if(existingStickerLayer) {
      const parent = existingStickerLayer.parentElement;
      parent.removeChild(existingStickerLayer);
      if(!stickerButton || parent === stickerButton.parentElement){
        return;
      }
    }
    if(!stickerButton) {
      console.warn('cannot show custom stickers when stickerButton is not defined');
      console.trace();
      return;
    }
    commentInjection.config.page = 0;
    const l1 = document.createElement('div');
    const l2 = document.createElement('div');
    const l3 = document.createElement('div');
    const stickerBox = document.createElement('div');
    l1.id = 'stickerbox';
    l1.className = 'CommentLineSticker custom_sticker_layer';
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
    stickerButton.parentElement.appendChild(l1);

    // create sticker button and content
    const stickerSetElement = document.querySelector('.se2_line_sticker_set');
    const stickers = await GM.getValue('sticker', []);
    for(let sticker of stickers) {
      const stickerElement = document.createElement('li');
      const stickerButton = document.createElement('button');
      const stickerListElement = document.createElement('div');
      const stickerListUlElement = document.createElement('ul');
      stickerButton.type = 'button';
      stickerButton.innerHTML = `<img src="${sticker.info.thumbnail}" height="26px"/>`;
      stickerButton.addEventListener('click', function(e) {
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
          let attachElement = this.closest('div.attach_box').querySelector('input.blind');
          attachElement.dispatchEvent(new Event('click'));
          attachElement.files = dataTransfer.files;
          dataTransfer.items.add(dataurlToFile(this.querySelector('img').src, '웡.gif'));
          attachElement.files = dataTransfer.files;
          attachElement.dispatchEvent(new Event('change'));
          // hide stickers
          commentInjection.showStickers();
        });
        stickerListUlElement.appendChild(li);
      }

      stickerElement.appendChild(stickerButton);

      stickerListElement.appendChild(stickerListUlElement);
      stickerElement.appendChild(stickerListElement);

      stickerSetElement.appendChild(stickerElement);
    }

    // add custom sticker import button
    const addStickerItem = document.createElement('li');
    const addStickerButton = document.createElement('button');
    addStickerButton.type = 'button';
    addStickerButton.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="26px" height="26px" viewBox="0 0 24 24" fill="none">
  <path d="M20 14V7C20 5.34315 18.6569 4 17 4H12M20 14L13.5 20M20 14H15.5C14.3954 14 13.5 14.8954 13.5 16V20M13.5 20H7C5.34315 20 4 18.6569 4 17V12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M7 4V7M7 10V7M7 7H4M7 7H10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
    addStickerItem.appendChild(addStickerButton)
    stickerSetElement.appendChild(addStickerItem);
    addStickerButton.addEventListener('click', commentInjection.addSticker);
    if(!commentInjection.config.page) {
      commentInjection.config.page = 0;
    }
    commentInjection.updateStickerBar();
    document.querySelector('.se2_prev').addEventListener('click', async function(){
      commentInjection.config.page--;
      commentInjection.updatePageButton();
      commentInjection.updateStickerBar();
    });
    document.querySelector('.se2_next').addEventListener('click', async function(){
      commentInjection.config.page++;
      commentInjection.updatePageButton();
      commentInjection.updateStickerBar();
    });
    stickerSetElement.querySelector(':first-child > button').click();
    commentInjection.updatePageButton();
  },
  injectAttachBox: async (attachBox) => {
    if(!attachBox){
      console.warn(`Cannot inject into commnet element(attachBox is ${attachBox})`);
      return;
    }
    attachBox.querySelector('.button_sticker').addEventListener('click', function(){
      const stickerLayer = this.parentElement.querySelector('.custom_sticker_layer');
      if(stickerLayer){
        this.parentElement.removeChild(stickerLayer);
      }
    });
    const button = document.createElement('a');
    button.style['margin-left'] = '16px';
    button.className = 'button_sticker custom_sticker_button';
    button.setAttribute('role', 'button');
    button.setAttribute('href', '#');
    button.innerHTML = `
    <svg xmlns="http://www.w3.org/22000/svg" height="17px" viewBox="0 0 24 24" fill="none">
    <path d="M9 16C9.85038 16.6303 10.8846 17 12 17C13.1154 17 14.1496 16.6303 15 16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <ellipse cx="15" cy="10.5" rx="1" ry="1.5" fill="currentColor"/>
    <ellipse cx="9" cy="10.5" rx="1" ry="1.5" fill="currentColor"/>
    <path d="M15 22H12C7.28595 22 4.92893 22 3.46447 20.5355C2 19.0711 2 16.714 2 12C2 7.28595 2 4.92893 3.46447 3.46447C4.92893 2 7.28595 2 12 2C16.714 2 19.0711 2 20.5355 3.46447C21.5093 4.43821 21.8356 5.80655 21.9449 8M15 22C18.866 22 22 18.866 22 15M15 22C15 20.1387 15 19.2081 15.2447 18.4549C15.7393 16.9327 16.9327 15.7393 18.4549 15.2447C19.2081 15 20.1387 15 22 15M22 12V15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>`;
    button.addEventListener('click', function(e){
      commentInjection.showStickers(this);
      e.preventDefault();
    });
    attachBox.appendChild(button);
  },
};


const seOneInjection = {
  config: {
    page: 0,
  },
  injectToolbar: async function(toolbar){
    const customStickerTool = document.createElement('li');
    const quotationTool = toolbar.querySelector('.se-toolbar-item-insert-quotation');
    customStickerTool.className = 'se-toolbar-item se-toolbar-item-sticker';
    customStickerTool.innerHTML = `
<button type="button" class="se-sticker-toolbar-button se-document-toolbar-toggle-button se-text-icon-toolbar-button">
  <span class="se-toolbar-icon" style="background-position: 0; background: none;">
    <svg xmlns="http://www.w3.org/22000/svg" height="20px" viewBox="0 0 24 24" fill="none" class="svg-icon">
      <path d="M9 16C9.85038 16.6303 10.8846 17 12 17C13.1154 17 14.1496 16.6303 15 16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      <ellipse cx="15" cy="10.5" rx="1" ry="1.5" fill="currentColor"/>
      <ellipse cx="9" cy="10.5" rx="1" ry="1.5" fill="currentColor"/>
      <path d="M15 22H12C7.28595 22 4.92893 22 3.46447 20.5355C2 19.0711 2 16.714 2 12C2 7.28595 2 4.92893 3.46447 3.46447C4.92893 2 7.28595 2 12 2C16.714 2 19.0711 2 20.5355 3.46447C21.5093 4.43821 21.8356 5.80655 21.9449 8M15 22C18.866 22 22 18.866 22 15M15 22C15 20.1387 15 19.2081 15.2447 18.4549C15.7393 16.9327 16.9327 15.7393 18.4549 15.2447C19.2081 15 20.1387 15 22 15M22 12V15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
  </span>
  <span class="se-toolbar-label" aria-hidden="true">커스텀 스티커</span>
  <span class="se-toolbar-tooltip">커스텀 스티커 추가</span>
</button>
`;
    customStickerTool.querySelector('button').addEventListener('mouseover', function(){this.querySelector('.svg-icon').style.color='#03c75a';});
    customStickerTool.querySelector('button').addEventListener('mouseout', function(){this.querySelector('.svg-icon').style.color='unset';});
    customStickerTool.querySelector('button').addEventListener('click', seOneInjection.showStickers);
    toolbar.insertBefore(customStickerTool, quotationTool);
  },
  updatePageButton: function(element) {
    const itemsElement = element.querySelector('.se-panel-tab-list');
    const computedStyle = window.getComputedStyle(itemsElement);
    const padding = parseInt(computedStyle.getPropertyValue('padding-left'), 10) + parseInt(computedStyle.getPropertyValue('padding-right'), 10);
    const displayWidth = itemsElement.clientWidth - padding;
    const maxWidth = itemsElement.scrollWidth - padding;
    const maxPage = Math.floor(maxWidth / displayWidth);
    if(seOneInjection.config.page < 0) {
      seOneInjection.config.page = 0;
    }
    if(seOneInjection.config.page > maxPage) {
      seOneInjection.config.page = maxPage;
    }
    const prevButton = element.querySelector('.se-panel-tab-prev-button');
    const nextButton = element.querySelector('.se-panel-tab-next-button');
    if(seOneInjection.config.page == maxPage) {
      nextButton.disabled = 'disabled';
    }
    else {
      nextButton.disabled = null;
    }
    if(seOneInjection.config.page == 0) {
      prevButton.disabled = 'disabled';
    }
    else {
      prevButton.disabled = null;
    }
  },
  nextButtonHandler: function() {
    const element = this.parentElement.querySelector('.se-panel-tab-list');
    const computedStyle = window.getComputedStyle(element);
    const padding = parseInt(computedStyle.getPropertyValue('padding-left'), 10) + parseInt(computedStyle.getPropertyValue('padding-right'), 10);
    const displayWidth = element.clientWidth - padding;
    const maxWidth = element.scrollWidth - padding;
    seOneInjection.config.page++;
    seOneInjection.updatePageButton(this.parentElement);
    let transform = displayWidth * seOneInjection.config.page;
    if(transform > maxWidth) {
      transform = transform - displayWidth;
    }
    element.style.transform = `translateX(-${transform}px)`;
  },
  prevButtonHandler: function() {
    const element = this.parentElement.querySelector('.se-panel-tab-list');
    const computedStyle = window.getComputedStyle(element);
    const padding = parseInt(computedStyle.getPropertyValue('padding-left'), 10) + parseInt(computedStyle.getPropertyValue('padding-right'), 10);
    const displayWidth = element.clientWidth - padding;
    seOneInjection.config.page--;
    seOneInjection.updatePageButton(this.parentElement);
    let transform = displayWidth * seOneInjection.config.page;
    element.style.transform = `translateX(-${transform}px)`;
  },
  showStickers: async function() {
    let editorTop = this.closest('div.se-dnd-wrap');
    let stickerLayer = editorTop.querySelector('.se-popup.__se-sentry');
    if(stickerLayer) {
      stickerLayer.querySelector('.se-popup-close-button').click();
    }
    stickerLayer = editorTop.querySelector('.se-popup')
    if(stickerLayer) {
      this.classList.remove('se-is-selected');
      stickerLayer.parentElement.removeChild(stickerLayer);
      return;
    }
    const popup = document.createElement('div');
    popup.className = 'se-popup se-popup-panel se-popup-sticker se-popup-outside';
    popup.innerHTML = `
    <div class="se-popup-dim se-popup-dim-transparent"></div>
    <div class="se-popup-container">
        <div class="se-popup-content">
            <div class="se-panel-header se-popup-panel-header"><strong class="se-panel-title">개쩌는 스티커!</strong></div>
            <div class="se-panel-tab se-panel-tab-sticker se-popup-panel-tab-sticker">
                <button type="button" class="se-panel-tab-prev-button"><span class="se-blind">이전</span></button>
                <button type="button" class="se-panel-tab-next-button"><span class="se-blind">다음</span></button>
                <ul class="se-panel-tab-list" style="transform: translateX(0px);">
                </ul>
            </div>
            <div class="se-panel-content se-panel-content-sticker se-popup-panel-content-sticker">
                <div class="se-sidebar-inner-scroll">
                </div>
            </div>
        </div>
      <button type="button" class="se-popup-close-button"><span class="se-blind">팝업 닫기</span></button>
    </div>
`;
    popup.querySelector('.se-panel-tab-prev-button').addEventListener('click', seOneInjection.prevButtonHandler);
    popup.querySelector('.se-panel-tab-next-button').addEventListener('click', seOneInjection.nextButtonHandler);
    const stickerIconItems = popup.querySelector('.se-panel-tab-list');
    const stickerItems = popup.querySelector('.se-sidebar-inner-scroll');
    const stickers = await GM.getValue('sticker', []);
    for(const [index, sticker] of stickers.entries()) {
      const iconItem = document.createElement('li');
      const iconItemButton = document.createElement('button');
      iconItem.className = 'se-tab-item';
      iconItemButton.className = 'se-tab-button';
      iconItemButton.dataset.id = index;
      iconItemButton.addEventListener('click', async function(){
        const activedSticker = this.closest('.se-panel-tab-list').querySelector('.se-is-selected');
        if(Array.from(this.classList).includes('se-is-selected')){
          return;
        }
        if(activedSticker) {
          this.closest('.se-popup-content').querySelector('.se-popup-panel-content-sticker .se-is-on').classList.remove('se-is-on');
          activedSticker.classList.remove('se-is-selected');
        }
        this.classList.add('se-is-selected');
        this.closest('.se-popup-content').querySelector(`.se-sidebar-inner-scroll ul:nth-child(${parseInt(this.dataset.id, 10) + 1})`).classList.add('se-is-on');
      });
      iconItemButton.innerHTML = `<img height="37px" src="${sticker.info.thumbnail}" />`;
      iconItem.appendChild(iconItemButton);
      stickerIconItems.appendChild(iconItem);
      const stickerList = document.createElement('ul');
      stickerList.className = 'se-sidebar-list';
      for(const stickerItem of sticker.stickers){
        const stickerItemElement = document.createElement('li');
        stickerItemElement.className = 'se-sidebar-item';
        stickerItemElement.innerHTML = `
<button type="button" class="se-sidebar-element se-sidebar-element-sticker" draggable="false">
  <img class="se-sidebar-sticker" src="${stickerItem.image}"/>
</button>`;
        stickerItemElement.querySelector('button').addEventListener('click', function(){
          const dataTransfer = new DataTransfer();
          const pasteElement = document.querySelector('div[allow="clipboard-read"]');
          dataTransfer.items.add(dataurlToFile(this.querySelector('img').src, '웡.gif'));
          console.log(dataTransfer);
          let event = new CustomEvent('paste', {
            bubbles: true,
          });
          event.clipboardData = dataTransfer;
          pasteElement.dispatchEvent(event);
          // hide stickers
          this.closest('div.se-popup-container').querySelector('button.se-popup-close-button').click();
        });
        stickerList.appendChild(stickerItemElement);
      }
      stickerItems.appendChild(stickerList);
    }

    const addStickerItem = document.createElement('li');
    addStickerItem.className = 'se-tab-item';
    addStickerItem.innerHTML = `
<button type="button" class="se-tab-button">
  <svg xmlns="http://www.w3.org/2000/svg" width="37px" height="37px" viewBox="0 0 24 24" fill="none">
    <path d="M20 14V7C20 5.34315 18.6569 4 17 4H12M20 14L13.5 20M20 14H15.5C14.3954 14 13.5 14.8954 13.5 16V20M13.5 20H7C5.34315 20 4 18.6569 4 17V12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M7 4V7M7 10V7M7 7H4M7 7H10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
</button>`;
    addStickerItem.querySelector('button').addEventListener('click', function(){
      addSticker(function(){
        document.querySelector('div.se-popup-container button.se-popup-close-button').click();
      });
    });
    stickerIconItems.appendChild(addStickerItem);
    popup.querySelector('.se-popup-close-button').addEventListener('click', function(){
      const popup = this.closest('div.se-popup');
      const editorTop = this.closest('div.se-dnd-wrap');
      const lable = editorTop.querySelector('.se-is-selected');
      lable.classList.remove('se-is-selected');
      popup.parentElement.removeChild(popup);
    });
    stickerIconItems.querySelector('li:first-child button').click();
    editorTop.querySelector('.se-container').appendChild(popup);
    this.classList.add("se-is-selected");
  },
};
// TODO: 네이밍 귀찮
new MutationObserver((a,b)=>{
  a.map(e=>{
    if(e.addedNodes.length) {
      Array.from(e.addedNodes).map((e)=>{
        if(e.classList){
          console.log(e);
          let classes = Array.from(e.classList);
          if(classes.includes('CommentItem') || classes.includes('article_wrap')){
            commentInjection.injectAttachBox(e.querySelector('.CommentWriter .attach_box'));
          }
          if(classes.includes('se-body')) {
            seOneInjection.injectToolbar(e.querySelector('.se-toolbar'));
          }
        }
      });
    }
  });
}).observe(document.body, {subtree: true, childList: true});

// when page is already loaded
const warp = document.querySelector('.article_wrap');
if(warp) {
  commentInjection.injectAttachBox(warp.querySelector('.CommentWriter .attach_box'));
}
