'use strict';

(() => {
  const $ = (id) => document.getElementById(id);

  const fileInput = $('video-file');
  const dropArea = $('drop-area');
  const video = $('source-video');
  const videoArea = $('video-area');
  const fileName = $('file-name');
  const fileMeta = $('file-meta');
  const trimStart = $('trim-start');
  const trimEnd = $('trim-end');
  const maxEdge = $('max-edge');
  const fpsSelect = $('fps');
  const colorsSelect = $('colors');
  const loopMode = $('loop-mode');
  const convertButton = $('convert-button');
  const progressWrap = $('progress-wrap');
  const progressBar = $('progress-bar');
  const progressLabel = $('progress-label');
  const progressPercent = $('progress-percent');
  const progressHelp = $('progress-help');
  const errorMessage = $('error-message');
  const estimate = $('estimate');
  const resultPanel = $('result-panel');
  const resultPreview = $('result-preview');
  const saveGif = $('save-gif');
  const originalSize = $('original-size');
  const gifSize = $('gif-size');
  const frameCountOutput = $('frame-count');
  const sizeNote = $('size-note');

  const MAX_FRAMES = 300;
  const MAX_TOTAL_PIXELS = 36_000_000;
  const PALETTE_SAMPLE_LIMIT_PER_FRAME = 18_000;

  let selectedFile = null;
  let sourceUrl = null;
  let resultUrl = null;
  let conversionRunning = false;

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  function formatDuration(seconds) {
    if (!Number.isFinite(seconds)) return '—';
    const whole = Math.floor(seconds);
    const minutes = Math.floor(whole / 60);
    const rest = whole % 60;
    const tenths = Math.floor((seconds - whole) * 10);
    return minutes > 0 ? `${minutes}:${String(rest).padStart(2, '0')}.${tenths}` : `${rest}.${tenths}秒`;
  }

  function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.remove('hidden');
  }

  function clearError() {
    errorMessage.textContent = '';
    errorMessage.classList.add('hidden');
  }

  function setProgress(percent, label, help = 'このタブを閉じずにお待ちください。') {
    const safePercent = Math.max(0, Math.min(100, percent));
    progressBar.value = safePercent;
    progressPercent.textContent = `${Math.round(safePercent)}%`;
    progressLabel.textContent = label;
    progressHelp.textContent = help;
  }

  function revokeUrl(url) {
    if (url) URL.revokeObjectURL(url);
  }

  function setSelectedFile(file) {
    if (!file) return;
    const looksLikeVideo = file.type.startsWith('video/') || /\.(mp4|mov|m4v|webm|ogv|avi|mkv)$/i.test(file.name);
    if (!looksLikeVideo) {
      showError('動画ファイルを選択してください。');
      return;
    }

    clearError();
    resultPanel.classList.add('hidden');
    revokeUrl(resultUrl);
    resultUrl = null;
    saveGif.removeAttribute('href');
    selectedFile = file;

    revokeUrl(sourceUrl);
    sourceUrl = URL.createObjectURL(file);
    video.pause();
    video.src = sourceUrl;
    video.load();
    fileName.textContent = file.name;
    fileMeta.textContent = `${formatBytes(file.size)} · 読み込み中…`;
    videoArea.classList.remove('hidden');
    dropArea.classList.add('hidden');
    convertButton.disabled = true;
    estimate.textContent = '動画情報を読み込んでいます…';
  }

  function updateEstimate() {
    if (!selectedFile || !Number.isFinite(video.duration) || !video.videoWidth) {
      estimate.textContent = '動画を選ぶと、変換の目安が表示されます。';
      convertButton.disabled = true;
      return;
    }

    const start = Number(trimStart.value);
    const end = Number(trimEnd.value);
    const fps = Number(fpsSelect.value);
    const dimensions = getOutputDimensions(Number(maxEdge.value));
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > video.duration + 0.05 || end <= start) {
      estimate.textContent = '開始・終了時間を確認してください。終了は開始より後に設定します。';
      convertButton.disabled = true;
      return;
    }

    const duration = end - start;
    const frames = Math.ceil(duration * fps);
    const pixels = dimensions.width * dimensions.height * frames;
    if (frames > MAX_FRAMES || pixels > MAX_TOTAL_PIXELS) {
      estimate.textContent = `推定 ${frames} フレーム・${dimensions.width}×${dimensions.height} px。長すぎるか大きすぎます。範囲を短くするか、FPS・サイズを下げてください。`;
      convertButton.disabled = true;
      return;
    }

    estimate.textContent = `約 ${frames} フレーム · ${dimensions.width}×${dimensions.height} px · ${formatDuration(duration)}。端末性能によって変換時間が変わります。`;
    convertButton.disabled = conversionRunning;
  }

  function getOutputDimensions(edgeLimit) {
    const sourceWidth = video.videoWidth || 1;
    const sourceHeight = video.videoHeight || 1;
    const scale = Math.min(1, edgeLimit / Math.max(sourceWidth, sourceHeight));
    return {
      width: Math.max(1, Math.round(sourceWidth * scale)),
      height: Math.max(1, Math.round(sourceHeight * scale)),
    };
  }

  function setBusy(busy) {
    conversionRunning = busy;
    fileInput.disabled = busy;
    $('change-file').disabled = busy;
    trimStart.disabled = busy;
    trimEnd.disabled = busy;
    maxEdge.disabled = busy;
    fpsSelect.disabled = busy;
    colorsSelect.disabled = busy;
    loopMode.disabled = busy;
    convertButton.disabled = busy || !selectedFile;
    if (busy) {
      progressWrap.classList.remove('hidden');
      setProgress(0, '準備中…');
    } else {
      progressWrap.classList.add('hidden');
      updateEstimate();
    }
  }

  function waitForVideoData() {
    if (video.readyState >= 2) return Promise.resolve();
    return new Promise((resolve, reject) => {
      let timeoutId;
      const cleanup = () => {
        video.removeEventListener('loadeddata', onLoaded);
        video.removeEventListener('error', onError);
        clearTimeout(timeoutId);
      };
      const onLoaded = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error('動画の最初のフレームを読み込めませんでした。'));
      };
      video.addEventListener('loadeddata', onLoaded, { once: true });
      video.addEventListener('error', onError, { once: true });
      timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error('動画データの読み込みがタイムアウトしました。'));
      }, 20000);
      try {
        // Nudge the local video element off time zero so the browser fetches a decodable frame.
        const nudgeTime = Math.min(0.08, Math.max(0.02, video.duration / 2));
        video.currentTime = Math.min(nudgeTime, Math.max(0, video.duration - 0.02));
      } catch (error) {
        cleanup();
        reject(new Error('動画データを読み込めませんでした。'));
      }
    });
  }

  function waitForSeek(targetTime) {
    return new Promise((resolve, reject) => {
      const safeTime = Math.max(0, Math.min(targetTime, Math.max(0, video.duration - 0.02)));
      if (Math.abs(video.currentTime - safeTime) < 0.015 && video.readyState >= 2) {
        resolve();
        return;
      }

      let timeoutId;
      const cleanup = () => {
        video.removeEventListener('seeked', onSeeked);
        video.removeEventListener('error', onError);
        clearTimeout(timeoutId);
      };
      const onSeeked = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error('動画のフレームを読み込めませんでした。'));
      };

      video.addEventListener('seeked', onSeeked, { once: true });
      video.addEventListener('error', onError, { once: true });
      timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error('動画の読み込みがタイムアウトしました。別の動画形式でもお試しください。'));
      }, 20000);

      try {
        video.currentTime = safeTime;
      } catch (error) {
        cleanup();
        reject(new Error('この動画の位置を移動できませんでした。'));
      }
    });
  }

  function drawCurrentFrame(context, width, height) {
    context.drawImage(video, 0, 0, width, height);
    return context.getImageData(0, 0, width, height).data;
  }

  function buildHistogramFrame(imageData, histogram) {
    const pixelCount = imageData.length / 4;
    const step = Math.max(1, Math.ceil(pixelCount / PALETTE_SAMPLE_LIMIT_PER_FRAME));
    for (let p = 0; p < pixelCount; p += step) {
      const offset = p * 4;
      if (imageData[offset + 3] < 128) continue;
      const key = (imageData[offset] >> 3) << 10 |
                  (imageData[offset + 1] >> 3) << 5 |
                  (imageData[offset + 2] >> 3);
      histogram[key]++;
    }
  }

  function medianCutPalette(histogram, maxColors) {
    const colors = [];
    for (let key = 0; key < histogram.length; key++) {
      const count = histogram[key];
      if (!count) continue;
      colors.push({
        r: (key >> 10) & 31,
        g: (key >> 5) & 31,
        b: key & 31,
        count,
      });
    }
    if (colors.length === 0) return [[0, 0, 0]];

    const makeBox = (items) => {
      let rMin = 31, gMin = 31, bMin = 31;
      let rMax = 0, gMax = 0, bMax = 0;
      let population = 0;
      for (const c of items) {
        rMin = Math.min(rMin, c.r); rMax = Math.max(rMax, c.r);
        gMin = Math.min(gMin, c.g); gMax = Math.max(gMax, c.g);
        bMin = Math.min(bMin, c.b); bMax = Math.max(bMax, c.b);
        population += c.count;
      }
      const range = Math.max(rMax - rMin, gMax - gMin, bMax - bMin);
      return { items, rMin, rMax, gMin, gMax, bMin, bMax, population, range, score: range * Math.sqrt(population) };
    };

    const boxes = [makeBox(colors)];
    while (boxes.length < maxColors) {
      let selectedIndex = -1;
      let selectedScore = -1;
      for (let i = 0; i < boxes.length; i++) {
        if (boxes[i].items.length < 2 || boxes[i].range === 0) continue;
        if (boxes[i].score > selectedScore) {
          selectedScore = boxes[i].score;
          selectedIndex = i;
        }
      }
      if (selectedIndex < 0) break;

      const box = boxes.splice(selectedIndex, 1)[0];
      const ranges = [box.rMax - box.rMin, box.gMax - box.gMin, box.bMax - box.bMin];
      const channel = ranges.indexOf(Math.max(...ranges));
      const channelName = ['r', 'g', 'b'][channel];
      box.items.sort((a, b) => a[channelName] - b[channelName]);
      const half = box.population / 2;
      let accumulated = 0;
      let splitAt = 1;
      for (let i = 0; i < box.items.length - 1; i++) {
        accumulated += box.items[i].count;
        splitAt = i + 1;
        if (accumulated >= half) break;
      }
      boxes.push(makeBox(box.items.slice(0, splitAt)));
      boxes.push(makeBox(box.items.slice(splitAt)));
    }

    return boxes.map((box) => {
      let r = 0, g = 0, b = 0, total = 0;
      for (const c of box.items) {
        r += (c.r * 8 + 4) * c.count;
        g += (c.g * 8 + 4) * c.count;
        b += (c.b * 8 + 4) * c.count;
        total += c.count;
      }
      return [Math.min(255, Math.round(r / total)), Math.min(255, Math.round(g / total)), Math.min(255, Math.round(b / total))];
    });
  }

  function makeColorLookup(palette) {
    const lookup = new Uint8Array(32768);
    for (let key = 0; key < 32768; key++) {
      const r = (((key >> 10) & 31) << 3) + 4;
      const g = (((key >> 5) & 31) << 3) + 4;
      const b = ((key & 31) << 3) + 4;
      let bestIndex = 0;
      let bestDistance = Infinity;
      for (let i = 0; i < palette.length; i++) {
        const dr = r - palette[i][0];
        const dg = g - palette[i][1];
        const db = b - palette[i][2];
        const distance = dr * dr * 0.299 + dg * dg * 0.587 + db * db * 0.114;
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = i;
        }
      }
      lookup[key] = bestIndex;
    }
    return lookup;
  }

  function mapPixelsToPalette(imageData, lookup) {
    const pixelCount = imageData.length / 4;
    const indexed = new Uint8Array(pixelCount);
    for (let p = 0; p < pixelCount; p++) {
      const offset = p * 4;
      const key = (imageData[offset] >> 3) << 10 |
                  (imageData[offset + 1] >> 3) << 5 |
                  (imageData[offset + 2] >> 3);
      indexed[p] = lookup[key];
    }
    return indexed;
  }

  class ByteWriter {
    constructor(initialCapacity = 1024) {
      this.buffer = new Uint8Array(initialCapacity);
      this.length = 0;
    }
    ensure(extra) {
      const needed = this.length + extra;
      if (needed <= this.buffer.length) return;
      let capacity = this.buffer.length;
      while (capacity < needed) capacity = Math.max(capacity * 2, needed);
      const next = new Uint8Array(capacity);
      next.set(this.buffer.subarray(0, this.length));
      this.buffer = next;
    }
    byte(value) {
      this.ensure(1);
      this.buffer[this.length++] = value & 255;
    }
    bytes(values) {
      this.ensure(values.length);
      this.buffer.set(values, this.length);
      this.length += values.length;
    }
    word(value) {
      this.byte(value & 255);
      this.byte((value >> 8) & 255);
    }
    finish() {
      return this.buffer.slice(0, this.length);
    }
  }

  function lzwEncode(indexedPixels, minCodeSize = 8) {
    const clearCode = 1 << minCodeSize;
    const endCode = clearCode + 1;
    let codeSize = minCodeSize + 1;
    let nextCode = endCode + 1;
    let dictionary = new Map();
    const output = new ByteWriter(Math.max(256, Math.floor(indexedPixels.length * 1.15)));
    let bitBuffer = 0;
    let bitCount = 0;

    const writeCode = (code) => {
      bitBuffer |= code << bitCount;
      bitCount += codeSize;
      while (bitCount >= 8) {
        output.byte(bitBuffer & 255);
        bitBuffer >>>= 8;
        bitCount -= 8;
      }
    };
    const resetDictionary = () => {
      dictionary = new Map();
      codeSize = minCodeSize + 1;
      nextCode = endCode + 1;
    };

    writeCode(clearCode);
    if (indexedPixels.length === 0) {
      writeCode(endCode);
    } else {
      let prefix = indexedPixels[0];
      for (let i = 1; i < indexedPixels.length; i++) {
        const symbol = indexedPixels[i];
        const key = (prefix << 8) | symbol;
        const found = dictionary.get(key);
        if (found !== undefined) {
          prefix = found;
          continue;
        }

        writeCode(prefix);
        if (nextCode < 4096) {
          dictionary.set(key, nextCode++);
          if (nextCode > (1 << codeSize) && codeSize < 12) codeSize++;
        } else {
          writeCode(clearCode);
          resetDictionary();
        }
        prefix = symbol;
      }
      writeCode(prefix);
      writeCode(endCode);
    }

    if (bitCount > 0) output.byte(bitBuffer & 255);
    return output.finish();
  }

  function writeGifHeader(writer, width, height, palette, loopForever) {
    writer.bytes(new TextEncoder().encode('GIF89a'));
    writer.word(width);
    writer.word(height);
    writer.byte(0xF7); // Global color table, 8-bit color resolution, 256 entries.
    writer.byte(0);
    writer.byte(0);

    for (let i = 0; i < 256; i++) {
      const color = palette[i] || [0, 0, 0];
      writer.byte(color[0]);
      writer.byte(color[1]);
      writer.byte(color[2]);
    }

    if (loopForever) {
      writer.byte(0x21); writer.byte(0xFF); writer.byte(11);
      writer.bytes(new TextEncoder().encode('NETSCAPE2.0'));
      writer.byte(3); writer.byte(1); writer.word(0); writer.byte(0);
    }
  }

  function writeGifFrame(writer, indexedPixels, width, height, delayCentiseconds) {
    const compressed = lzwEncode(indexedPixels, 8);

    // Graphic Control Extension: disposal method 2, no transparency.
    writer.byte(0x21); writer.byte(0xF9); writer.byte(4);
    writer.byte(0x08);
    writer.word(delayCentiseconds);
    writer.byte(0);
    writer.byte(0);

    // Image descriptor, using the global palette.
    writer.byte(0x2C);
    writer.word(0); writer.word(0);
    writer.word(width); writer.word(height);
    writer.byte(0);
    writer.byte(8); // LZW minimum code size.

    for (let offset = 0; offset < compressed.length; offset += 255) {
      const length = Math.min(255, compressed.length - offset);
      writer.byte(length);
      writer.bytes(compressed.subarray(offset, offset + length));
    }
    writer.byte(0); // End of image data sub-blocks.
  }

  function assembleGif(width, height, palette, indexedFrames, fps, loopForever) {
    const writer = new ByteWriter();
    writeGifHeader(writer, width, height, palette, loopForever);
    const delay = Math.max(2, Math.round(100 / fps));
    for (const pixels of indexedFrames) writeGifFrame(writer, pixels, width, height, delay);
    writer.byte(0x3B);
    return writer.finish();
  }

  async function convertVideo() {
    if (!selectedFile || conversionRunning) return;
    clearError();
    resultPanel.classList.add('hidden');

    const start = Number(trimStart.value);
    const end = Number(trimEnd.value);
    const fps = Number(fpsSelect.value);
    const maxColors = Number(colorsSelect.value);
    const dimensions = getOutputDimensions(Number(maxEdge.value));
    const duration = end - start;
    const frameTotal = Math.ceil(duration * fps);
    const pixelTotal = dimensions.width * dimensions.height * frameTotal;

    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > video.duration + 0.05) {
      showError('切り取り範囲を確認してください。');
      return;
    }
    if (frameTotal > MAX_FRAMES || pixelTotal > MAX_TOTAL_PIXELS) {
      showError('処理量が大きすぎます。切り取り範囲を短くするか、FPS・出力サイズを下げてください。');
      return;
    }

    setBusy(true);
    video.pause();
    const previousTime = video.currentTime;
    const canvas = document.createElement('canvas');
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      setBusy(false);
      showError('このブラウザではCanvasを利用できません。');
      return;
    }

    try {
      await waitForVideoData();
      // Pass 1: inspect frames to build a single palette for the whole GIF.
      setProgress(1, '色を解析しています…', '動画を端末内で読み取り、GIF用の色パレットを作成します。');
      const histogram = new Uint32Array(32768);
      for (let i = 0; i < frameTotal; i++) {
        const timestamp = Math.min(end - 0.01, start + i / fps);
        await waitForSeek(timestamp);
        const pixels = drawCurrentFrame(context, dimensions.width, dimensions.height);
        buildHistogramFrame(pixels, histogram);
        if (i % 2 === 0 || i === frameTotal - 1) {
          setProgress(2 + ((i + 1) / frameTotal) * 43, `色を解析しています… (${i + 1}/${frameTotal})`);
          await new Promise((resolve) => requestAnimationFrame(resolve));
        }
      }

      const palette = medianCutPalette(histogram, maxColors);
      const lookup = makeColorLookup(palette);

      // Pass 2: encode frames directly into the output buffer (no frame archive).
      setProgress(46, 'GIFを組み立てています…', 'フレームを再読み込みしてGIFデータに変換しています。');
      const gifWriter = new ByteWriter();
      writeGifHeader(gifWriter, dimensions.width, dimensions.height, palette, loopMode.value === 'forever');
      const frameDelay = Math.max(2, Math.round(100 / fps));
      for (let i = 0; i < frameTotal; i++) {
        const timestamp = Math.min(end - 0.01, start + i / fps);
        await waitForSeek(timestamp);
        const pixels = drawCurrentFrame(context, dimensions.width, dimensions.height);
        const indexedPixels = mapPixelsToPalette(pixels, lookup);
        writeGifFrame(gifWriter, indexedPixels, dimensions.width, dimensions.height, frameDelay);
        if (i % 2 === 0 || i === frameTotal - 1) {
          setProgress(46 + ((i + 1) / frameTotal) * 52, `GIFを組み立てています… (${i + 1}/${frameTotal})`);
          await new Promise((resolve) => requestAnimationFrame(resolve));
        }
      }
      gifWriter.byte(0x3B);
      const gifBytes = gifWriter.finish();
      const gifBlob = new Blob([gifBytes], { type: 'image/gif' });
      revokeUrl(resultUrl);
      resultUrl = URL.createObjectURL(gifBlob);
      resultPreview.src = resultUrl;
      saveGif.href = resultUrl;
      saveGif.download = `${selectedFile.name.replace(/\.[^.]+$/, '') || 'video'}.gif`;
      originalSize.textContent = formatBytes(selectedFile.size);
      gifSize.textContent = formatBytes(gifBlob.size);
      frameCountOutput.textContent = `${frameTotal} 枚`;

      const ratio = gifBlob.size / selectedFile.size;
      const percent = Math.round(Math.abs(1 - ratio) * 100);
      if (ratio < 1) {
        sizeNote.textContent = `元動画より約 ${percent}% 小さくなりました（ファイルサイズ比較）。`;
      } else {
        sizeNote.textContent = `GIFは元動画より約 ${percent}% 大きくなりました。動画とGIFでは圧縮方式が異なります。`;
      }

      setProgress(100, '変換が完了しました', 'GIFはまだ端末に保存されていません。下のボタンから必要な場合だけ保存できます。');
      resultPanel.classList.remove('hidden');
      resultPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      console.error(error);
      showError(error instanceof Error ? error.message : '変換中に予期しないエラーが発生しました。');
    } finally {
      try {
        if (Number.isFinite(previousTime)) await waitForSeek(previousTime).catch(() => {});
      } catch (_) {
        // Keep the generated result even if restoring the preview position fails.
      }
      canvas.width = 1;
      canvas.height = 1;
      setBusy(false);
      if (!resultPanel.classList.contains('hidden')) {
        progressWrap.classList.remove('hidden');
      }
    }
  }

  fileInput.addEventListener('change', (event) => {
    const file = event.target.files && event.target.files[0];
    if (file) setSelectedFile(file);
  });

  $('change-file').addEventListener('click', () => {
    fileInput.value = '';
    fileInput.click();
  });

  video.addEventListener('loadedmetadata', () => {
    if (!selectedFile) return;
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    trimStart.value = '0';
    trimEnd.value = duration.toFixed(1);
    fileMeta.textContent = `${formatBytes(selectedFile.size)} · ${video.videoWidth}×${video.videoHeight} · ${formatDuration(duration)}`;
    updateEstimate();
  });

  video.addEventListener('error', () => {
    if (!selectedFile) return;
    convertButton.disabled = true;
    showError('このブラウザで動画を読み込めませんでした。MP4（H.264）など、ブラウザが再生できる形式をお試しください。');
    estimate.textContent = '動画を読み込めません。対応形式の動画を選び直してください。';
  });

  [trimStart, trimEnd, maxEdge, fpsSelect, colorsSelect, loopMode].forEach((element) => {
    element.addEventListener('input', updateEstimate);
    element.addEventListener('change', updateEstimate);
  });

  convertButton.addEventListener('click', convertVideo);

  $('convert-again').addEventListener('click', () => {
    resultPanel.classList.add('hidden');
    clearError();
    window.scrollTo({ top: $('settings-title').getBoundingClientRect().top + window.scrollY - 18, behavior: 'smooth' });
  });

  dropArea.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropArea.classList.add('drag-over');
  });
  dropArea.addEventListener('dragleave', () => dropArea.classList.remove('drag-over'));
  dropArea.addEventListener('drop', (event) => {
    event.preventDefault();
    dropArea.classList.remove('drag-over');
    const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
    if (file) setSelectedFile(file);
  });

  window.addEventListener('beforeunload', () => {
    revokeUrl(sourceUrl);
    revokeUrl(resultUrl);
  });

  // Keep the UI in a safe state when a user returns to the page from the background.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && conversionRunning) video.pause();
  });
})();
