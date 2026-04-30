var _pickerImages = [];
var _pickerTarget = null;
var _pickerPreview = null;

async function openImagePicker(targetId, previewId) {
  _pickerTarget  = targetId;
  _pickerPreview = previewId;
  document.getElementById('imgpicker').classList.add('open');
  document.getElementById('imgpicker_search').value = '';
  if (_pickerImages.length) { renderPickerGrid(''); return; }
  document.getElementById('imgpicker_grid').innerHTML = '<div class="picker-msg">Loading images...</div>';
  try {
    _pickerImages = await fetch('/cards/images').then(r => r.json());
  } catch(e) {
    document.getElementById('imgpicker_grid').innerHTML = '<div class="picker-msg picker-msg-err">Failed to load images</div>';
    return;
  }
  renderPickerGrid('');
}

function closeImgPicker() {
  document.getElementById('imgpicker').classList.remove('open');
  _pickerImages = [];
}

function renderPickerGrid(search) {
  var grid = document.getElementById('imgpicker_grid');
  if (!_pickerImages.length) {
    grid.innerHTML = '<div class="picker-msg">No images yet. Upload via Media \u2192 Card.</div>';
    return;
  }
  var q = (search || '').trim().toLowerCase();
  var filtered = q ? _pickerImages.filter(function(i) {
    return i.filename.toLowerCase().includes(q) ||
      (i.anime || '').toLowerCase().includes(q) ||
      (i.cardName || '').toLowerCase().includes(q);
  }) : _pickerImages;
  if (!filtered.length) {
    grid.innerHTML = '<div class="picker-msg">No results for "' + q + '"</div>';
    return;
  }
  var groups = {};
  filtered.forEach(function(img) {
    var key = img.anime || 'Uncategorized';
    if (!groups[key]) groups[key] = [];
    groups[key].push(img);
  });
  grid.innerHTML = '';
  Object.keys(groups).sort().forEach(function(anime) {
    var label = document.createElement('div');
    label.className = 'picker-group-label';
    label.textContent = anime + ' (' + groups[anime].length + ')';
    grid.appendChild(label);
    var row = document.createElement('div');
    row.className = 'picker-items';
    groups[anime].forEach(function(img) {
      var item = document.createElement('div');
      item.className = 'picker-item';
      item.addEventListener('click', function() {
        if (_pickerTarget) {
          var el = document.getElementById(_pickerTarget);
          if (el) el.value = img.url;
        }
        if (_pickerPreview) {
          var p = document.getElementById(_pickerPreview);
          if (p) { p.src = img.url; p.classList.add('visible'); }
        }
        closeImgPicker();
      });
      var imgEl = document.createElement('img');
      imgEl.src = img.url;
      imgEl.loading = 'lazy';
      var lbl = document.createElement('div');
      lbl.className = 'picker-item-label';
      lbl.textContent = img.cardName || img.filename;
      item.appendChild(imgEl);
      item.appendChild(lbl);
      row.appendChild(item);
    });
    grid.appendChild(row);
  });
}

async function uploadCardImage(input, targetId, previewId) {
  if (!input.files[0]) return;
  var btn = input.closest('label');
  if (btn) btn.style.opacity = '0.6';
  var fd = new FormData();
  fd.append('image', input.files[0]);
  try {
    var r = await fetch('/cards/upload-image', { method: 'POST', body: fd });
    var d = await r.json();
    if (d.url) {
      var el = document.getElementById(targetId);
      if (el) el.value = d.url;
      var p = document.getElementById(previewId);
      if (p) { p.src = d.url; p.classList.add('visible'); }
      _pickerImages = [];
    } else {
      alert('Upload failed: ' + (d.error || 'unknown error'));
    }
  } catch(e) { alert('Upload failed: ' + e.message); }
  finally { if (btn) btn.style.opacity = '1'; }
}

document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('[data-preview-for]').forEach(function(img) {
    var inp = document.getElementById(img.dataset.previewFor);
    if (inp && inp.value) { img.src = inp.value; img.classList.add('visible'); }
    if (inp) inp.addEventListener('input', function() {
      if (this.value) { img.src = this.value; img.classList.add('visible'); }
      else img.classList.remove('visible');
    });
  });
});
