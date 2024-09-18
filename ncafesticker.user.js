// ==UserScript==
// @name        Naver cafe sticker for PC
// @match       *://cafe.naver.com/*
// @grant       GM.getValue
// @grant       GM.setValue
// @grant       GM.deleteValue
// @run-at      document-body
// @version     1.9
// @author      웡웡이
// @require     https://code.jquery.com/jquery-3.7.1.js
// @require     https://code.jquery.com/ui/1.14.0/jquery-ui.js
// ==/UserScript==

const config = {};
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

clearStickerList = async (callback) => {
  const reply = confirm(`모든 스티커를 삭제합니다. 계속하시겠습니까?`);
  if (reply) {
    await GM.setValue('sticker', []);
    let stickers = await GM.getValue('sticker_list', []);
    for (let sticker of stickers) {
      await GM.deleteValue(`sticker_${sticker.id}`);
    }
    await GM.setValue('sticker_list', []);
    console.info(`삭제 완료`);
    if (callback) {
      callback();
    }
    return;
  }
  console.info(`사용자가 삭제를 취소함`);
};

async function getStickerList() {
  return await GM.getValue('sticker_list', []);
}

async function getSticker(id) {
  return await GM.getValue(`sticker_${id}`, []);
}

function detectMime(arr) {
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
  for (var i = 0; i < arr.length; i++) {
    header += arr[i].toString(16);
  }
  for (let mime of mimes) {
    if (header.startsWith(mime.magic)) {
      return mime.mime;
    }
  }
  // failback for naver cafe
  return 'image/gif';
}

async function getSeoneInfo() {
  if (!getSeoneInfo.cache) {
    const response = await fetch(`https://apis.naver.com/cafe-web/cafe-editor-api/v2/cafes/${location.href.replace(/^.*cafes\//, '').match(/\d*/)[0]}/editor?experienceMode=true&from=pc`, {
      method: 'GET',
      mode: 'cors',
      credentials: 'include',
      headers: {
        'X-Cafe-Product': 'pc',
      },
    });
    getSeoneInfo.cache = (await response.json()).result;
  }
  return getSeoneInfo.cache;
}

function randomUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    let r = Math.random() * 16 | 0,
      v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

async function getCachedImage(file) {
  if (!file) {
    return null;
  }
  if (file instanceof File) {
    file = await file.arrayBuffer();
  }
  const operation = window.crypto.subtle || window.crypto.webkitSubtle;
  const hash = await operation.digest('SHA-256', file);
  const hashArray = Array.from(new Uint8Array(hash));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  const cached = await GM.getValue(`image_${hashHex}`);
  if (cached) {
    return cached;
  }
  return null;
}

async function cacheImage(file, res) {
  if (file instanceof File) {
    file = await file.arrayBuffer();
  }
  const operation = window.crypto.subtle || window.crypto.webkitSubtle;
  const hash = await operation.digest('SHA-256', file);
  const hashArray = Array.from(new Uint8Array(hash));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  await GM.setValue(`image_${hashHex}`, res);
  return hashHex;
}

async function uploadImage(file) {
  // data url to blob
  file = dataurlToFile(file, randomUUID() + '.gif');
  const cached = await getCachedImage(file);
  if (cached) {
    return cached;
  }
  const seOneInfo = await getSeoneInfo();
  const sessionKey = await (await fetch('https://platform.editor.naver.com/api/cafepc001/v1/photo-uploader/session-key', {
    method: 'GET',
    mode: 'cors',
    credentials: 'include',
    headers: {
      'SE-App-Id': `SE-${randomUUID()}`,
      'SE-Authorization': seOneInfo.token,
    },
  })).json();
  if (!sessionKey.isSuccess) {
    throw '세션 키를 가져오는데 실패했습니다';
  }
  const formData = new FormData();
  formData.append('image', file);
  const url = new URL(`https://cafe.upphoto.naver.com/${sessionKey.sessionKey}/simpleUpload/0`);
  url.searchParams.append('userId', seOneInfo.userId);
  url.searchParams.append('extractExif', 'true');
  url.searchParams.append('extractAnimatedCnt', 'true');
  url.searchParams.append('autorotate', 'true');
  url.searchParams.append('extractDominantColor', 'false');
  url.searchParams.append('denyAnimatedImage', 'false');
  url.searchParams.append('skipXcamFiltering', 'true');
  const response = await fetch(url, {
    method: 'POST',
    mode: 'cors',
    credentials: 'include',
    body: formData,
  });
  // parse xml
  const data = await response.text();
  const parser = new DOMParser();
  const xml = parser.parseFromString(data, 'text/xml');
  const result = {
    url: xml.querySelector('item > url').textContent,
    width: parseInt(xml.querySelector('item > width').textContent, 10),
    height: parseInt(xml.querySelector('item > height').textContent, 10),
    fileSize: parseInt(xml.querySelector('item > fileSize').textContent, 10),
    thumbnail: xml.querySelector('item > thumbnail').textContent,
  }
  await cacheImage(file, result);
  return result;
}

function decodeBase64(data) {
  return Uint8Array.from(Array.from(atob(data)).map(e => e.charCodeAt(0)));;
}

function dataurlToFile(url, filename) {
  let content = decodeBase64(url.split(',')[1]);
  return new File([content], filename, { type: detectMime(content) });
}

function isValidImage(url) {
  try {
    let urlObj = new URL(url);
    if (urlObj.protocol !== 'data:') {
      return false;
    }
    let path = urlObj.pathname;
    if (/^image\/\w*;base64,[\w\/-=]*$/.test(path)) {
      return true;
    }
    return false;
  } catch (e) {
    console.error(e);
    return false;
  }
}

function checkObjectType(obj, types) {
  try {
    let count = 0;
    const keys = Object.keys(obj);
    for (const val of types) {
      if (!keys.includes(val.key)) {
        console.log(`키 값 없음: ${val.key}`);
        return false;
      }
      if (val.type === 'image') {
        if (typeof obj[val.key] !== 'string' && !isValidImage(obj[val.key])) {
          console.log(`이미지 타입 확인 실패: ${val.key}(${obj[val.key]})`);
          return false;
        }
        count++;
        continue;
      }
      if (val.type === 'array') {
        if (typeof obj[val.key] !== 'object' && !Array.isArray(obj[val.key])) {
          console.log(`배열 타입 확인 실패: ${val.key}(${obj[val.key]})`);
          return false;
        }
        if (val.data && !obj[val.key].every(function (e) { return checkObjectType(e, val.data) })) {
          console.log(`배열 타입 확인 실패: ${val.key}(${obj[val.key]})`);
          return false;
        }
        count++;
        continue;
      }
      if (typeof obj[val.key] !== val.type) {
        console.log(`타입 확인 실패: ${val.key}(${obj[val.key]})`);
        return false;
      }
      if (val.type === 'number' && (isNaN(obj[val.key]) || !isFinite(obj[val.key]))) {
        console.log(`숫자 확인 실패: ${val.key}(${obj[val.key]})`);
        return false;
      }
      if (val.type === 'object' && (obj[val.key] === null || (val.data && !checkObjectType(obj[val.key], val.data)))) {
        console.log(`객체 확인 실패: ${val.key}(${obj[val.key]})`);
        return false;
      }
      count++;
    }
    if (keys.length !== count) {
      console.log(`갯수 실패: ${keys.length} !== ${count}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
}

async function addSticker(success) {
  let input = document.createElement('input');
  input.type = 'file';
  input.setAttribute('accept', 'application/json');
  input.setAttribute('multiple', '');
  input.onchange = function (e) {
    Array.from(e.target.files).map((file) => {
      let reader = new FileReader();
      reader.readAsText(file, 'UTF-8');
      reader.onload = async function (e) {
        try {
          let content = JSON.parse(e.target.result);
          let assertStickerType = false;
          if (!content) {
            assertStickerType = true;
          }
          else if (!content.info) {
            assertStickerType = true;
          }
          else if (!content.stickers) {
            assertStickerType = true;
          }
          else if (!checkObjectType(content, [
            {
              key: 'info', type: 'object', data: [
                { key: 'id', type: 'number' },
                { key: 'name', type: 'string' },
                { key: 'description', type: 'string' },
                { key: 'thumbnail', type: 'image' },
              ]
            },
            {
              key: 'stickers', type: 'array', data: [
                { key: 'id', type: 'number' },
                { key: 'image', type: 'string' },
              ]
            },
          ])) {
            throw '파일이 스티커 형식이 아닌 것 같습니다';
          }
          if (assertStickerType) {
            throw '파일이 스티커 형식이 아닌 것 같습니다';
          }
          const stickers = await getStickerList();

          const idConflict = stickers.filter(function (e) { return content.id == e.id; });
          if (idConflict.length) {
            if (!confirm(`${content.name}(${content.id})은(는) 이미 ${idConflict.map((e) => e.name + "(" + e.id + ")").join(', ')}(으)로 추가되어있습니다.\n덮어쓰겠습니까?`)) {
              return;
            }
            await GM.setValue(`sticker_${content.info.id}`, content.stickers);
          }
          else {
            stickers.push(content.info);
            await GM.setValue('sticker_list', stickers);
            await GM.setValue(`sticker_${content.info.id}`, content.stickers);
          }
          await GM.setValue('sticker_list', stickers);
        } catch (e) {
          console.error(e);
          alert('올바른 형식이 아닙니다!');
        }
      }
    });
    try {
      success();
    } catch (e) { }
  }
  input.click();
}

const commentInjection = {
  config: {},
  addSticker: async function () {
    addSticker(commentInjection.showStickers);
  },
  resetSticker: async function () {
    clearStickerList(commentInjection.showStickers);
  },
  updateStickerBar: function () {
    const stickers = Array.from(document.querySelector('.se2_line_sticker_set').childNodes);
    let notElement = 0;
    for (const [index, sticker] of stickers.entries()) {
      // ignore text element
      if (!(sticker instanceof Element)) {
        notElement++;
        continue;
      }
      if (index - notElement >= commentInjection.config.page * 16 && index - notElement < (commentInjection.config.page + 1) * 16) {
        sticker.childNodes[0].style.display = '';
      }
      else {
        sticker.childNodes[0].style.display = 'none';
      }
    }
  },
  updatePageButton: function () {
    let elementCount = 0;
    for (const sticker of Array.from(document.querySelector('.se2_line_sticker_set').childNodes)) {
      if (sticker instanceof Element) {
        elementCount++;
      }
    }
    const maxPage = Math.floor(elementCount / 16);
    if (commentInjection.config.page < 0) {
      commentInjection.config.page = 0;
    }
    if (commentInjection.config.page > maxPage) {
      commentInjection.config.page = maxPage;
    }
    let next = document.querySelector('.se2_next');
    // when next button is enabled
    if (next && commentInjection.config.page == maxPage) {
      next.className = 'se2_next_off';
      next.disabled = 'disabled';
    }
    // when next button is disabled
    else if (!next && commentInjection.config.page < maxPage) {
      next = document.querySelector('.se2_next_off');
      next.className = 'se2_next';
      next.disabled = null;
    }
    let prev = document.querySelector('.se2_prev');
    if (prev && commentInjection.config.page <= 0) {
      prev.className = 'se2_prev_off';
      prev.disabled = 'disabled';
    }
    else if (!prev && commentInjection.config.page > 0) {
      prev = document.querySelector('.se2_prev_off')
      prev.className = 'se2_prev';
      prev.disabled = null;
    }
  },
  showSticker: async function (stickerButton) {
    let list = stickerButton.parentElement.querySelector('.se2_linesticker_list > ul');
    if (list.childNodes.length) {
      return;
    }
    list.innerHTML = '';
    const stickers = await getSticker(stickerButton.dataset['id']);
    for (let sticker of stickers) {
      let li = document.createElement('li');
      list.appendChild(li);
      li.style.background = 'unset';
      li.innerHTML = `<button type="button" style="background: unset;"><img/></button>`;
      li.querySelector('button img').style['max-width'] = '100px';
      li.querySelector('button img').style['max-height'] = '100px';
      li.querySelector('button img').src = sticker.image;
      li.addEventListener('mouseover', function () { this.style.background = "#EEEEEE"; });
      li.addEventListener('mouseout', function () { this.style.background = "unset"; });
      li.addEventListener('click', function () {
        const dataTransfer = new DataTransfer();
        let attachElement = this.closest('div.attach_box').querySelector('input.blind');
        attachElement.dispatchEvent(new Event('click'));
        attachElement.files = dataTransfer.files;
        dataTransfer.items.add(dataurlToFile(this.querySelector('img').src, '웡.gif'));
        attachElement.files = dataTransfer.files;
        attachElement.dispatchEvent(new Event('change'));
        // hide stickers
        commentInjection.showStickers();
      }
      );
    }
  },
  showStickers: async function showStickers(stickerButton) {
    if (document.querySelector('._btn_shop')) {
      document.querySelector('.button_sticker').click();
      while (document.querySelector('._btn_shop')) await sleep(100);
    }
    const existingStickerLayer = document.querySelector('.custom_sticker_layer');
    if (existingStickerLayer) {
      const parent = existingStickerLayer.parentElement;
      parent.removeChild(existingStickerLayer);
      if (!stickerButton || parent === stickerButton.parentElement) {
        return;
      }
    }
    if (!stickerButton) {
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
    const stickers = await getStickerList();
    for (let sticker of stickers) {
      const stickerElement = document.createElement('li');
      const stickerButton = document.createElement('button');
      const stickerListElement = document.createElement('div');
      const stickerListUlElement = document.createElement('ul');
      stickerButton.type = 'button';
      stickerButton.innerHTML = `<img height="26px"/>`;
      stickerButton.querySelector('img').src = sticker.thumbnail;
      stickerButton.dataset['id'] = sticker.id;
      stickerButton.addEventListener('click', function (e) {
        Array.from(this.parentElement.parentElement.childNodes).map(e => {
          if (e instanceof Element) {
            e.className = "";
            e.style.filter = 'grayscale(1)';
          }
        });
        this.parentElement.className = 'active';
        this.parentElement.style.filter = 'unset';
        commentInjection.showSticker(this);
      });
      stickerListElement.className = 'se2_linesticker_list';

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
    const deleteStickerItem = document.createElement('li');
    const deleteStickerButton = document.createElement('button');
    deleteStickerButton.type = 'button';
    deleteStickerButton.innerHTML = `
<svg xmlns="http://www.w3.org/2000/svg" width="26px" height="26px" viewBox="0 0 24 24" fill="none">
  <path d="M3 3L21 21M18 6L17.6 12M17.2498 17.2527L17.1991 18.0129C17.129 19.065 17.0939 19.5911 16.8667 19.99C16.6666 20.3412 16.3648 20.6235 16.0011 20.7998C15.588 21 15.0607 21 14.0062 21H9.99377C8.93927 21 8.41202 21 7.99889 20.7998C7.63517 20.6235 7.33339 20.3412 7.13332 19.99C6.90607 19.5911 6.871 19.065 6.80086 18.0129L6 6H4M16 6L15.4559 4.36754C15.1837 3.55086 14.4194 3 13.5585 3H10.4416C9.94243 3 9.47576 3.18519 9.11865 3.5M11.6133 6H20M14 14V17M10 10V17" stroke="#000000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
    deleteStickerItem.appendChild(deleteStickerButton)
    stickerSetElement.appendChild(deleteStickerItem);
    deleteStickerButton.addEventListener('click', commentInjection.resetSticker);
    if (!commentInjection.config.page) {
      commentInjection.config.page = 0;
    }
    commentInjection.updateStickerBar();
    document.querySelector('.se2_prev').addEventListener('click', async function () {
      commentInjection.config.page--;
      commentInjection.updatePageButton();
      commentInjection.updateStickerBar();
    });
    document.querySelector('.se2_next').addEventListener('click', async function () {
      commentInjection.config.page++;
      commentInjection.updatePageButton();
      commentInjection.updateStickerBar();
    });
    stickerSetElement.querySelector(':first-child > button').click();
    commentInjection.updatePageButton();
  },
  injectAttachBox: async (attachBox) => {
    if (!attachBox) {
      console.warn(`Cannot inject into commnet element(attachBox is ${attachBox})`);
      return;
    }
    attachBox.querySelector('.button_sticker').addEventListener('click', function () {
      const stickerLayer = this.parentElement.querySelector('.custom_sticker_layer');
      if (stickerLayer) {
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
    button.addEventListener('click', function (e) {
      commentInjection.showStickers(this);
      e.preventDefault();
    });
    attachBox.appendChild(button);
  },
};

function injectDownloadButton() {
  Array.from(document.querySelectorAll('script[type="text/data"].__se_module_data')).map(async e => {
    const metadata = JSON.parse(e.dataset['module']);
    const parent = e.parentElement;
    if (metadata.type !== 'v2_video' || !Array.from(parent.classList).includes('se-video')) {
      return;
    }
    const buttonElement = document.createElement('button');
    buttonElement.style.display = 'flex';
    buttonElement.type = 'button';
    buttonElement.innerHTML = `
<svg xmlns="http://www.w3.org/2000/svg" width="16px" height="16px" viewBox="0 0 24 24" fill="none">
  <path d="M12 6.25C12.4142 6.25 12.75 6.58579 12.75 7V12.1893L14.4697 10.4697C14.7626 10.1768 15.2374 10.1768 15.5303 10.4697C15.8232 10.7626 15.8232 11.2374 15.5303 11.5303L12.5303 14.5303C12.3897 14.671 12.1989 14.75 12 14.75C11.8011 14.75 11.6103 14.671 11.4697 14.5303L8.46967 11.5303C8.17678 11.2374 8.17678 10.7626 8.46967 10.4697C8.76256 10.1768 9.23744 10.1768 9.53033 10.4697L11.25 12.1893V7C11.25 6.58579 11.5858 6.25 12 6.25Z" fill="currentColor"/>
  <path d="M7.25 17C7.25 16.5858 7.58579 16.25 8 16.25H16C16.4142 16.25 16.75 16.5858 16.75 17C16.75 17.4142 16.4142 17.75 16 17.75H8C7.58579 17.75 7.25 17.4142 7.25 17Z" fill="currentColor"/>
  <path fill-rule="evenodd" clip-rule="evenodd" d="M11.9426 1.25C9.63423 1.24999 7.82519 1.24998 6.4137 1.43975C4.96897 1.63399 3.82895 2.03933 2.93414 2.93414C2.03933 3.82895 1.63399 4.96897 1.43975 6.41371C1.24998 7.82519 1.24999 9.63423 1.25 11.9426V12.0574C1.24999 14.3658 1.24998 16.1748 1.43975 17.5863C1.63399 19.031 2.03933 20.1711 2.93414 21.0659C3.82895 21.9607 4.96897 22.366 6.4137 22.5603C7.82519 22.75 9.63423 22.75 11.9426 22.75H12.0574C14.3658 22.75 16.1748 22.75 17.5863 22.5603C19.031 22.366 20.1711 21.9607 21.0659 21.0659C21.9607 20.1711 22.366 19.031 22.5603 17.5863C22.75 16.1748 22.75 14.3658 22.75 12.0574V11.9426C22.75 9.63423 22.75 7.82519 22.5603 6.41371C22.366 4.96897 21.9607 3.82895 21.0659 2.93414C20.1711 2.03933 19.031 1.63399 17.5863 1.43975C16.1748 1.24998 14.3658 1.24999 12.0574 1.25H11.9426ZM3.9948 3.9948C4.56445 3.42514 5.33517 3.09825 6.61358 2.92637C7.91356 2.75159 9.62177 2.75 12 2.75C14.3782 2.75 16.0864 2.75159 17.3864 2.92637C18.6648 3.09825 19.4355 3.42514 20.0052 3.9948C20.5749 4.56445 20.9018 5.33517 21.0736 6.61358C21.2484 7.91356 21.25 9.62178 21.25 12C21.25 14.3782 21.2484 16.0864 21.0736 17.3864C20.9018 18.6648 20.5749 19.4355 20.0052 20.0052C19.4355 20.5749 18.6648 20.9018 17.3864 21.0736C16.0864 21.2484 14.3782 21.25 12 21.25C9.62177 21.25 7.91356 21.2484 6.61358 21.0736C5.33517 20.9018 4.56445 20.5749 3.9948 20.0052C3.42514 19.4355 3.09825 18.6648 2.92637 17.3864C2.75159 16.0864 2.75 14.3782 2.75 12C2.75 9.62178 2.75159 7.91356 2.92637 6.61358C3.09825 5.33517 3.42514 4.56445 3.9948 3.9948Z" fill="currentColor"/>
</svg><span style="line-height: 16px;vertical-align: middle;">다운로드하기</span>
`;
    buttonElement.addEventListener('click', async function () {
      const downloadText = this.querySelector('span');
      downloadText.innerText = '다운로드 중…';
      try {
        this.disabled = 'disabled';
        const metadata = JSON.parse(e.parentElement.querySelector('script[type="text/data"].__se_module_data').dataset['module']);
        const data = await (await fetch(`https://apis.naver.com/rmcnmv/rmcnmv/vod/play/v2.0/${metadata.data.vid}?key=${metadata.data.inkey}&nonce=${Math.floor(performance.timeOrigin + performance.now())}&devt=HTML5_PC`, {
          method: 'GET',
          mode: "cors",
          credentials: "include",
        })).json();
        let downloadProgress = {
          total: 0,
          start: Date.now(),
        };
        fetch(data.videos.list.pop().source).then(async (res) => {
          const reader = res.body.getReader();
          const stream = new ReadableStream({
            start(controller) {
              function push() {
                reader.read().then(({ done, value }) => {
                  if (done) {
                    controller.close();
                    return;
                  }
                  controller.enqueue(value);
                  push();
                  downloadText.innerText = `다운로드 중… ${((downloadProgress.total += value.length) / 1000 / 1000).toFixed(2)}MB(${((downloadProgress.total / 1000 / 1000) / ((Date.now() - downloadProgress.start) / 1000)).toFixed(2)}MB/s)`;
                });
              }
              push();
            }
          });
          const readableStream = new Response(stream);
          const videoData = URL.createObjectURL(await readableStream.blob());
          const link = document.createElement("a");
          link.href = videoData;
          link.download = `${metadata.data.vid}.mp4`;
          link.click();
          this.disabled = null;
          downloadText.innerText = '다운로드하기';
        }).catch(e => {
          const pre = document.createElement('pre');
          console.error(e);
          downloadText.innerText = '다운로드 실패!';
          this.querySelector('span').appendChild(pre);
        });
      } catch (e) {
        const pre = document.createElement('pre');
        pre.innerText = e.toString();
        console.error(e);
        downloadText.innerText = '다운로드 실패!';
        this.querySelector('span').appendChild(pre);
      }
    });
    parent.appendChild(buttonElement);
  });
}

const seOneInjection = {
  config: {
    page: 0,
  },
  hideSticker: function () {
    document.querySelector('div.se-popup-container button.se-popup-close-button').click();
  },
  addSticker: async function () {
    addSticker(seOneInjection.hideSticker);
  },
  removeSticker: async function () {
    if (seOneInjection.editSticker.isMoving) {
      return;
    }
    const button = this.querySelector('.se-tab-button');
    const id = parseInt(button.dataset['id']);
    const sticker = await getStickerList().then(e => e.find(e => e.id === id));
    if (confirm(`${sticker.name}(${id})을(를) 정말 삭제하시겠습니까? 변경사항이 저장되지 않습니다.`)) {
      if (isNaN(id)) {
        return;
      }
      GM.getValue('sticker_list').then(async (stickerList) => {
        const newStickerList = stickerList.filter(e => e.id !== id);
        await GM.setValue('sticker_list', newStickerList);
        await GM.deleteValue(`sticker_${id}`);
        location.reload();
      });
    }
  },
  editSticker: async function () {
    if (seOneInjection.editSticker.isEditing) {
      try {
        jQuery('.se-panel-tab-list').sortable('destroy');
        seOneInjection.editSticker.isEditing = false;
        document.querySelector('.se-panel-tab-list').childNodes.forEach(e => {
          if (!(e instanceof Element)) {
            return;
          }
          e.getAnimations().forEach(e => e.cancel());
          e.removeEventListener('click', seOneInjection.removeSticker);
        });
        return;
      } catch (e) { }
    }
    seOneInjection.editSticker.isEditing = true;
    document.querySelector('.se-panel-tab-list').childNodes.forEach(e => {
      if (!(e instanceof Element)) {
        return;
      }
      let button = e.querySelector('.se-tab-button');
      if (!button || !button.dataset['id']) {
        return;
      }
      e.animate([
        { transform: 'rotate(0deg)' },
        { transform: 'rotate(-3deg)' },
        { transform: 'rotate(0deg)' },
        { transform: 'rotate(3deg)' },
        { transform: 'rotate(0deg)' },
      ], {
        duration: 250,
        iterations: Infinity,
      });
      e.addEventListener('click', seOneInjection.removeSticker);
    });
    jQuery('.se-panel-tab-list').sortable({
      items: '.sortable.se-tab-item',
      handle: '.se-tab-button',
      cursor: 'move',
      opacity: 0.5,
      containment: 'parent',
      cancel: '',
    })
      .on('sortstart', function () {
        seOneInjection.editSticker.isMoving = true;
      })
      .on('sortstop', async function () {
        const stickers = Array.from(document.querySelector('.se-panel-tab-list').childNodes).map(e => {
          if (!(e instanceof Element)) {
            return;
          }
          let button = e.querySelector('.se-tab-button');
          if (!button) {
            return;
          }
          const id = parseInt(button.dataset['id']);
          if (isNaN(id)) {
            return;
          }
          return id;
        }).filter(e => e);
        const stickerList = await getStickerList();
        const newStickerList = [];
        for (const id of stickers) {
          const sticker = stickerList.find(e => e.id === id);
          if (sticker) {
            newStickerList.push(sticker);
          }
        }
        await GM.setValue('sticker_list', newStickerList);
        seOneInjection.editSticker.isMoving = false;
        return true;
      });
  },
  injectToolbar: async function (toolbar) {
    const customStickerTool = document.createElement('li');
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
    customStickerTool.querySelector('button').addEventListener('mouseover', function () { this.querySelector('.svg-icon').style.color = '#03c75a'; });
    customStickerTool.querySelector('button').addEventListener('mouseout', function () { this.querySelector('.svg-icon').style.color = 'unset'; });
    customStickerTool.querySelector('button').addEventListener('click', seOneInjection.showStickers);
    toolbar.appendChild(customStickerTool);
  },
  updatePageButton: function (element) {
    const itemsElement = element.querySelector('.se-panel-tab-list');
    const computedStyle = window.getComputedStyle(itemsElement);
    const padding = parseInt(computedStyle.getPropertyValue('padding-left'), 10) + parseInt(computedStyle.getPropertyValue('padding-right'), 10);
    const displayWidth = itemsElement.clientWidth - padding;
    const maxElementInPage = Math.floor(displayWidth / 40);
    const maxPage = Math.floor(itemsElement.childNodes.length / maxElementInPage);
    if (seOneInjection.config.page < 0) {
      seOneInjection.config.page = 0;
    }
    if (seOneInjection.config.page > maxPage) {
      seOneInjection.config.page = maxPage;
    }
    const prevButton = element.querySelector('.se-panel-tab-prev-button');
    const nextButton = element.querySelector('.se-panel-tab-next-button');
    if (seOneInjection.config.page == maxPage) {
      nextButton.disabled = 'disabled';
    }
    else {
      nextButton.disabled = null;
    }
    if (seOneInjection.config.page == 0) {
      prevButton.disabled = 'disabled';
    }
    else {
      prevButton.disabled = null;
    }
  },
  nextButtonHandler: function () {
    const element = this.parentElement.querySelector('.se-panel-tab-list');
    const computedStyle = window.getComputedStyle(element);
    const padding = parseInt(computedStyle.getPropertyValue('padding-left'), 10) + parseInt(computedStyle.getPropertyValue('padding-right'), 10);
    const displayWidth = element.clientWidth - padding;
    const maxWidth = element.scrollWidth - padding;
    const maxElementInPage = Math.floor(displayWidth / 40);
    seOneInjection.config.page++;
    seOneInjection.updatePageButton(this.parentElement);
    let transform = 40 * maxElementInPage * seOneInjection.config.page;
    if (transform > maxWidth) {
      transform = transform - displayWidth;
    }
    element.style.transform = `translateX(-${transform}px)`;
  },
  prevButtonHandler: function () {
    const element = this.parentElement.querySelector('.se-panel-tab-list');
    const computedStyle = window.getComputedStyle(element);
    const padding = parseInt(computedStyle.getPropertyValue('padding-left'), 10) + parseInt(computedStyle.getPropertyValue('padding-right'), 10);
    const displayWidth = element.clientWidth - padding;
    const maxElementInPage = Math.floor(displayWidth / 40);
    seOneInjection.config.page--;
    seOneInjection.updatePageButton(this.parentElement);
    let transform = 40 * maxElementInPage * seOneInjection.config.page;
    if (transform < 0) {
      transform = 0;
    }
    element.style.transform = `translateX(-${transform}px)`;
  },
  showSticker: async function (stickerButton) {
    const stickerID = parseInt(stickerButton.dataset['id'], 10);
    let list = stickerButton.closest('.se-popup-content')
      .querySelector(`.se-panel-content-sticker .se-sidebar-inner-scroll > ul[data-id="${stickerID}"]`);
    if (list.childNodes.length) {
      return;
    }
    list.innerHTML = '';
    const stickers = await getSticker(stickerID);
    for (let sticker of stickers) {
      let li = document.createElement('li');
      li.className = 'se-sidebar-item';
      li.innerHTML = `
<button type="button" class="se-sidebar-element se-sidebar-element-sticker" draggable="false">
  <img class="se-sidebar-sticker"/>
</button>`;
      li.querySelector('button img').src = sticker.image;
      li.querySelector('button').addEventListener('click', function () {
        uploadImage(this.querySelector('img').src).then(async (upload) => {
          const pasteElement = document.querySelector('div[allow="clipboard-read"]');
          // localstorage se3#SE_COPIED_DATA
          let oWidth = upload.width;
          let oHeight = upload.height;
          let rsWidth = upload.width;
          let rsHeight = upload.height;
          const maxSide = 125;
          if (oWidth > maxSide || oHeight > maxSide) {
            if (oWidth > oHeight) {
              rsWidth = maxSide;
              rsHeight = Math.round((oHeight / oWidth) * maxSide);
            }
            else {
              rsHeight = maxSide;
              rsWidth = Math.round((oWidth / oHeight) * maxSide);
            }
          }
          localStorage.setItem('se3#SE_COPIED_DATA', JSON.stringify({
            docId: `TEMP-SE-${randomUUID()}`,
            copyData: [
              {
                id: `SE-${randomUUID()}`,
                ctype: 'image',
                src: `https://cafeptthumb-phinf.pstatic.net/${upload.url}`,
                width: rsWidth,
                height: rsHeight,
                origin: {
                  ctype: 'imageOrigin',
                  srcFrom: 'local',
                },
                originalWidth: oWidth,
                originalHeight: oHeight,
                fileSize: upload.fileSize,
                domain: 'https://cafeptthumb-phinf.pstatic.net',
                path: upload.url,
                widthPercentage: 0,
                represent: true,
                caption: null,
                fileName: `SE-${randomUUID()}.gif`,
                format: 'normal',
                imageLoaded: true,
                internalResource: true,
                layout: 'default',
              },
            ],
          }));
          const dataTransfer = new DataTransfer();
          // add text/html to clipboard
          dataTransfer.items.add(`<span data-input-buffer="INPUT_BUFFER_DATA;${encodeURIComponent(navigator.userAgent)};cafe.naver.com"></span>`, 'text/html');
          dataTransfer.items.add('사진 설명을 입력하세요.', 'text/plain');
          let event = new CustomEvent('paste', {
            bubbles: true,
          });
          event.clipboardData = dataTransfer;
          pasteElement.dispatchEvent(event);
        });
        // hide stickers
        this.closest('div.se-popup-container').querySelector('button.se-popup-close-button').click();
      });
      list.appendChild(li);
    }
  },
  showStickers: async function () {
    let editorTop = this.closest('div.se-dnd-wrap');
    let stickerLayer = editorTop.querySelector('.se-popup.__se-sentry');
    if (stickerLayer) {
      stickerLayer.querySelector('.se-popup-close-button').click();
    }
    stickerLayer = editorTop.querySelector('.se-popup')
    if (stickerLayer) {
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
            <div class="se-panel-header se-popup-panel-header"><strong class="se-panel-title">웡쩌는 스티커!</strong></div>
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
    const stickers = await getStickerList();
    for (let sticker of stickers) {
      const iconItem = document.createElement('li');
      const iconItemButton = document.createElement('button');
      iconItem.className = 'se-tab-item sortable';
      iconItemButton.className = 'se-tab-button';
      iconItemButton.style['filter'] = 'grayscale(1)';
      iconItemButton.dataset.id = sticker.id;
      iconItemButton.addEventListener('click', async function () {
        const activedSticker = this.closest('.se-panel-tab-list').querySelector('.se-is-selected');
        if (Array.from(this.classList).includes('se-is-selected')) {
          return;
        }
        if (activedSticker) {
          this.closest('.se-popup-content').querySelector('.se-popup-panel-content-sticker .se-is-on').classList.remove('se-is-on');
          activedSticker.style['filter'] = 'grayscale(1)';
          activedSticker.classList.remove('se-is-selected');
        }
        this.classList.add('se-is-selected');
        this.style['filter'] = 'grayscale(0)';
        this.closest('.se-popup-content').querySelector('.se-panel-title').innerText = sticker.name;
        this.closest('.se-popup-content').querySelector(`.se-sidebar-inner-scroll ul[data-id="${this.dataset.id}"]`).classList.add('se-is-on');
        seOneInjection.showSticker(this);
      });
      iconItemButton.innerHTML = `<img/>`;
      iconItemButton.querySelector('img').src = sticker.thumbnail
      iconItemButton.querySelector('img').style.maxWidth = '37px';
      iconItemButton.querySelector('img').style.maxHeight = '37px';
      iconItem.appendChild(iconItemButton);
      stickerIconItems.appendChild(iconItem);
      const stickerList = document.createElement('ul');
      stickerList.className = 'se-sidebar-list';
      stickerList.dataset.id = sticker.id;
      stickerItems.appendChild(stickerList);
    }

    const addStickerItem = document.createElement('li');
    addStickerItem.className = 'se-tab-item';
    addStickerItem.innerHTML = `
<button type="button" class="se-tab-button">
  <svg xmlns="http://www.w3.org/2000/svg" width="30px" height="30px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">
  <path d="M 22.666667,14.666668 V 5.3333337 c 0,-2.2091335 -1.7908,-4.0000004 -4.000001,-4.0000004 H 12 m 10.666667,13.3333347 -8.666667,8 m 8.666667,-8 H 16.666666 C 15.193866,14.666668 14,15.860535 14,17.333335 v 5.333333 m 0,0 H 5.3333333 c -2.2091334,0 -4,-1.7908 -4,-4 v -6.666667"/>
  <path d="M7 4V7M7 10V7M7 7H4M7 7H10"/>
  </svg>
</button>`;
    addStickerItem.querySelector('button').addEventListener('click', seOneInjection.addSticker);
    stickerIconItems.appendChild(addStickerItem);
    const editStickerItem = document.createElement('li');
    editStickerItem.className = 'se-tab-item';
    editStickerItem.innerHTML = `
<button type="button" class="se-tab-button">
  <svg xmlns="http://www.w3.org/2000/svg" width="30px" height="30px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
</button>`;
    editStickerItem.querySelector('button').addEventListener('click', seOneInjection.editSticker);
    stickerIconItems.appendChild(editStickerItem);
    popup.querySelector('.se-popup-close-button').addEventListener('click', function () {
      const popup = this.closest('div.se-popup');
      const editorTop = this.closest('div.se-dnd-wrap');
      const lable = editorTop.querySelector('.se-is-selected');
      lable.classList.remove('se-is-selected');
      popup.parentElement.removeChild(popup);
    });
    stickerIconItems.querySelector('li:first-child button').click();
    editorTop.querySelector('.se-container').appendChild(popup);
    this.classList.add("se-is-selected");
    seOneInjection.config.page = 0;
    seOneInjection.updatePageButton(popup);
  },
};
// TODO: 네이밍 귀찮
new MutationObserver(async (a, b) => {
  a.map(e => {
    if (e.addedNodes.length) {
      Array.from(e.addedNodes).map((e) => {
        if (e.classList) {
          let classes = Array.from(e.classList);
          if (classes.includes('article_wrap')) {
            injectDownloadButton();
            commentInjection.injectAttachBox(e.querySelector('.CommentWriter .attach_box'));
          }
          if (classes.includes('CommentItem')) {
            commentInjection.injectAttachBox(e.querySelector('.CommentWriter .attach_box'));
          }
          if (classes.includes('se-body')) {
            seOneInjection.injectToolbar(e.querySelector('.se-toolbar'));
          }
        }
      });
    }
  });
}).observe(document.body, { subtree: true, childList: true });

// when page is already loaded
const wrap = document.querySelector('.article_wrap');
if (wrap) {
  commentInjection.injectAttachBox(wrap.querySelector('.CommentWriter .attach_box'));
  injectDownloadButton();
}

// migrate old stickers
(async () => {
  let oldStickers = await GM.getValue('sticker', []);
  if (!oldStickers || !oldStickers.length) {
    return;
  }
  let newStickers = await getStickerList();
  for (let sticker of oldStickers) {
    newStickers.push(sticker.info);
    await GM.setValue(`sticker_${sticker.info.id}`, sticker.stickers);
  }
  await GM.setValue('sticker', []);
  await GM.setValue('sticker_list', newStickers);
})();
