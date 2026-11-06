/* HORUS additive export planner. No storage, filesystem, DOM, or network access. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.HorusFunnelCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var FAMILY_NOTE = 'Phonetic families are approximate consonant-skeleton and starting-sound views, not exact pronunciation truth or topics. Each unique non-stopword contributes its own head and skeleton. A complete line can appear in several family views, once within each view. No dictionary or alliteration gate is used.';
  var LETTER_NOTE = 'A-Z uses the first ASCII letter after Latin diacritic/ligature transliteration, ignoring leading punctuation and numbers. Text without such a letter is retained under _ and reported for review.';
  var RESERVED = /^(?:CON|PRN|AUX|NUL|CLOCK\$|CONIN\$|CONOUT\$|COM[1-9¹²³]|LPT[1-9¹²³])(?:\.|$)/i;
  var UNSAFE = /[<>:"/\\|?*\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/;
  var LATIN = {
    'Æ': 'AE', 'æ': 'ae', 'Œ': 'OE', 'œ': 'oe', 'ß': 'ss', 'ẞ': 'SS',
    'Ø': 'O', 'ø': 'o', 'Ł': 'L', 'ł': 'l', 'Đ': 'D', 'đ': 'd',
    'Ð': 'D', 'ð': 'd', 'Þ': 'TH', 'þ': 'th', 'ı': 'i', 'Ŋ': 'N', 'ŋ': 'n',
    'Ħ': 'H', 'ħ': 'h', 'Ŧ': 'T', 'ŧ': 't', 'Ə': 'E', 'ə': 'e'
  };

  function validateSegment(segment) {
    if (typeof segment !== 'string' || !segment || !segment.trim()) {
      throw new TypeError('Unsafe path segment: a nonempty string is required.');
    }
    if (segment === '.' || segment === '..') throw new Error('Unsafe path: traversal segments are forbidden.');
    if (UNSAFE.test(segment) || /[. ]$/.test(segment)) {
      throw new Error('Unsafe Windows path segment: ' + JSON.stringify(segment));
    }
    // Windows strips spaces/dots from the device stem, even before an extension.
    if (RESERVED.test(segment) || RESERVED.test(segment.split('.')[0].replace(/[. ]+$/, ''))) {
      throw new Error('Reserved Windows device name: ' + JSON.stringify(segment));
    }
    if (segment.length > 255) throw new Error('Windows path segment exceeds 255 characters.');
    return segment;
  }

  function validateRelativePath(path) {
    if (typeof path !== 'string' || !path || !path.trim()) {
      throw new TypeError('Unsafe path: a nonempty relative path is required.');
    }
    if (/^[\\/]/.test(path) || /^[A-Za-z]:/.test(path)) {
      throw new Error('Unsafe path: absolute, drive, and UNC paths are forbidden.');
    }
    var normalized = path.replace(/\\/g, '/');
    normalized.split('/').forEach(validateSegment);
    return normalized;
  }

  function pathKey(path) { return path.normalize('NFC').toUpperCase(); }
  function normalizeText(text) { return text.normalize('NFC').trim().replace(/\s+/gu, ' ').toUpperCase(); }
  function transliterate(text) {
    return text.replace(/[ÆæŒœßẞØøŁłĐđÐðÞþıŊŋĦħŦŧƏə]/g, function (c) { return LATIN[c]; })
      .normalize('NFKD').replace(/\p{M}/gu, '');
  }
  function firstLetter(text) {
    var match = transliterate(text).toUpperCase().match(/[A-Z]/);
    return match ? match[0] : '_';
  }
  function wordsIn(text) {
    return transliterate(text).toUpperCase().replace(/[’‘]/g, "'").match(/[A-Z]+(?:'[A-Z]+)*/g) || [];
  }
  function compareStrings(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
  function compareRecords(a, b) {
    return compareStrings(a.sortKey, b.sortKey) || compareStrings(a.normalized, b.normalized) || a.id - b.id;
  }
  function positiveInteger(value, name, allowZero) {
    if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) {
      throw new TypeError(name + ' must be a ' + (allowZero ? 'nonnegative' : 'positive') + ' safe integer.');
    }
    return value;
  }
  function htmlEscape(value) {
    return String(value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function encodePart(value) {
    return encodeURIComponent(value).replace(/[!'()*]/g, function (c) {
      return '%' + c.charCodeAt(0).toString(16).toUpperCase();
    });
  }
  function relativeHref(fromDirectory, target, directory) {
    var from = validateRelativePath(fromDirectory).split('/');
    var to = validateRelativePath(target).split('/');
    var common = 0;
    while (common < from.length && common < to.length && from[common] === to[common]) common++;
    var parts = new Array(from.length - common).fill('..').concat(to.slice(common).map(encodePart));
    return (parts.join('/') || '.') + (directory ? '/' : '');
  }
  function utf8Length(text) {
    var length = 0;
    for (var c of text) {
      var code = c.codePointAt(0);
      length += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
    }
    return length;
  }
  // Measure JSON without first allocating a potentially enormous serialization.
  function jsonStringBytes(text) {
    var bytes = 2;
    for (var c of text) {
      var code = c.codePointAt(0);
      if (c === '"' || c === '\\' || /[\b\t\n\f\r]/.test(c)) bytes += 2;
      else if (code < 32 || (code >= 0xd800 && code <= 0xdfff)) bytes += 6;
      else bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
    }
    return bytes;
  }
  function jsonByteLength(value, formatted, depth) {
    depth = depth || 0;
    if (value === null) return 4;
    if (typeof value === 'string') return jsonStringBytes(value);
    if (typeof value === 'number' || typeof value === 'boolean') return String(value).length;
    var array = Array.isArray(value);
    var keys = array ? value.map(function (_, i) { return i; }) : Object.keys(value);
    if (!keys.length) return 2;
    var bytes = formatted ? 4 + depth * 2 + (keys.length - 1) * 2 : 2 + keys.length - 1;
    keys.forEach(function (key) {
      if (formatted) bytes += (depth + 1) * 2;
      if (!array) bytes += jsonStringBytes(key) + (formatted ? 2 : 1);
      bytes += jsonByteLength(value[key], formatted, depth + 1);
    });
    return bytes;
  }
  function copyBasename(name, prefix) {
    var base = name.split('/').pop();
    var available = 255 - prefix.length;
    if (available < 1) throw new Error('batchId is too long for original-copy filenames.');
    if (base.length > available) {
      // Retain the extension where possible, without splitting a surrogate pair.
      var dot = base.lastIndexOf('.');
      var extension = dot > 0 && base.length - dot < available / 2 ? base.slice(dot) : '';
      var stem = extension ? base.slice(0, dot) : base;
      var truncated = '';
      for (var c of stem) {
        if (truncated.length + c.length > available - extension.length) break;
        truncated += c;
      }
      base = truncated.replace(/[. ]+$/, '') + extension;
    }
    return validateSegment(prefix + base);
  }

  function planExport(options) {
    if (!options || typeof options !== 'object') throw new TypeError('planExport requires an options object.');
    var records = options.records;
    var originals = options.originals === undefined ? [] : options.originals;
    if (!Array.isArray(records)) throw new TypeError('records must be an array of {text, source, line?}.');
    if (!Array.isArray(originals)) throw new TypeError('originals must be an array of {name, data}.');
    [records, originals].forEach(function (array) {
      for (var i = 0; i < array.length; i++) {
        if (!Object.prototype.hasOwnProperty.call(array, i)) throw new TypeError('Inputs must be dense arrays; missing entries cannot be silently skipped.');
      }
    });
    var batchId = validateSegment(options.batchId);
    var letterBase = options.letterBase === undefined ? 'A-Z' : options.letterBase;
    if (letterBase !== '') letterBase = validateRelativePath(letterBase);
    var chunkLines = positiveInteger(options.chunkLines === undefined ? 5000 : options.chunkLines, 'chunkLines');
    var maxRecords = positiveInteger(options.maxRecords === undefined ? 200000 : options.maxRecords, 'maxRecords', true);
    var maxOutputFiles = positiveInteger(options.maxOutputFiles === undefined ? 20000 : options.maxOutputFiles, 'maxOutputFiles');
    var maxFamilyLinks = positiveInteger(options.maxFamilyLinks === undefined ? 1000000 : options.maxFamilyLinks, 'maxFamilyLinks', true);
    var maxOutputBytes = positiveInteger(options.maxOutputBytes === undefined ? 220 * 1024 * 1024 : options.maxOutputBytes, 'maxOutputBytes');
    var maxFamilyLineChars = positiveInteger(options.maxFamilyLineChars === undefined ? 20000 : options.maxFamilyLineChars, 'maxFamilyLineChars');
    var maxFamilyWordsPerRecord = positiveInteger(options.maxFamilyWordsPerRecord === undefined ? 256 : options.maxFamilyWordsPerRecord, 'maxFamilyWordsPerRecord');
    function assertByteBudget(bytes) {
      if (!Number.isSafeInteger(bytes) || bytes > maxOutputBytes) {
        throw new RangeError('Output byte limit exceeded: maxOutputBytes=' + maxOutputBytes + '. Split intake into smaller batches; no export was produced.');
      }
    }
    if (records.length > maxRecords) {
      throw new RangeError('Record limit exceeded: ' + records.length + ' inputs exceed maxRecords=' + maxRecords + '. Split intake into smaller batches; no export was produced.');
    }
    if (originals.length + 5 > maxOutputFiles) {
      throw new RangeError('Output file limit exceeded: original copies and run reports exceed maxOutputFiles=' + maxOutputFiles + '. Split intake into smaller batches; no export was produced.');
    }
    var head = options.head, skel = options.skel, pretty = options.pretty;
    if (typeof head !== 'function' || typeof skel !== 'function' || typeof pretty !== 'function') {
      throw new TypeError('head, skel, and pretty must be injected heuristic functions.');
    }
    var stopInput = options.stopWords === undefined ? [] : options.stopWords;
    if (!Array.isArray(stopInput) && !(stopInput instanceof Set)) throw new TypeError('stopWords must be an array or Set of strings.');
    var stopWords = new Set();
    for (var stop of stopInput) {
      if (typeof stop !== 'string') throw new TypeError('stopWords must contain only strings.');
      var tokens = wordsIn(stop);
      if (tokens.length !== 1) throw new TypeError('Each stopWords item must contain exactly one word.');
      stopWords.add(tokens[0]);
    }

    var runPath = 'HORUS_FUNNEL_RUNS/' + batchId;
    var indexPath = runPath + '/' + batchId + '_INDEX.html';
    var summaryPath = runPath + '/' + batchId + '_SUMMARY.txt';
    var manifestPath = runPath + '/' + batchId + '_manifest.json';
    var estimatedViewBytes = 0, inputTextBytes = 0;
    // Copies are flat, numbered, and batch-prefixed. Equal/case-equal input names
    // remain separate copies; the full original name is retained in provenance.
    var originalInputs = originals.map(function (original, i) {
      if (!original || typeof original !== 'object') throw new TypeError('Original ' + (i + 1) + ' must be {name, data}.');
      var name = validateRelativePath(original.name);
      if (typeof original.data !== 'string' && !(original.data instanceof Uint8Array)) {
        throw new TypeError('Original ' + (i + 1) + ' data must be a string or Uint8Array.');
      }
      var prefix = batchId + '_' + String(i + 1).padStart(6, '0') + '_';
      var path = runPath + '/Originals/' + copyBasename(name, prefix);
      var byteLength = typeof original.data === 'string' ? utf8Length(original.data) : original.data.byteLength;
      estimatedViewBytes += byteLength;
      assertByteBudget(estimatedViewBytes);
      return {
        id: i + 1, name: original.name, path: path,
        byteLength: byteLength,
        representation: typeof original.data === 'string' ? 'string' : 'Uint8Array'
      };
    });

    var canonical = new Map(), az = new Map(), families = new Map(), familyPaths = new Map();
    var mappedRecords = [], uniqueRecords = [], review = [];
    var blankCount = 0, duplicateCount = 0, unclassifiedCount = 0, unknownCount = 0;
    var familyLinkCount = 0, analysisSkippedCount = 0, recordBytes = [];

    function checkGroupMinimum() {
      if (az.size + families.size + originals.length + 5 > maxOutputFiles) {
        throw new RangeError('Output file limit exceeded: classification groups exceed maxOutputFiles=' + maxOutputFiles + '. Split intake into smaller batches; no export was produced.');
      }
    }
    function familyFor(word) {
      var sound = head(word), skeleton = skel(word);
      if (sound === undefined || sound === null || sound === '' || skeleton === undefined || skeleton === null || skeleton === '') return null;
      if (typeof sound !== 'string' || typeof skeleton !== 'string') throw new TypeError('head and skel must return strings or an empty classification.');
      sound = sound.toUpperCase();
      skeleton = skeleton.toUpperCase();
      // These are consonant codes, not user-supplied folder paths. Reject unsafe
      // output instead of silently collapsing different keys into one family.
      validateSegment(sound);
      validateSegment(skeleton);
      if (!/^[A-Z0-9]+$/.test(sound) || !/^[A-Z0-9]+$/.test(skeleton)) {
        throw new Error('Heuristic heads and skeletons must contain only ASCII letters/digit codes.');
      }
      var soundLabel = pretty(sound);
      var parts = skeleton.split('').map(function (code) { return pretty(code); });
      if (typeof soundLabel !== 'string' || parts.some(function (part) { return typeof part !== 'string'; })) {
        throw new TypeError('pretty must return strings.');
      }
      if (!soundLabel || parts.some(function (part) { return !part; })) return null;
      soundLabel = soundLabel.toUpperCase();
      var skeletonLabel = parts.map(function (part) { return part.toUpperCase(); }).join('-');
      validateSegment(soundLabel);
      validateSegment(skeletonLabel);
      if (!/^[A-Z0-9-]+$/.test(soundLabel) || !/^[A-Z0-9-]+$/.test(skeletonLabel)) {
        throw new Error('Pretty family labels must contain only ASCII letters, digit codes, and hyphens.');
      }
      var key = sound + '\u0000' + skeleton;
      var path = 'PHONETIC_FAMILIES/' + soundLabel + '/' + skeletonLabel;
      var collisionKey = pathKey(path);
      if (familyPaths.has(collisionKey) && familyPaths.get(collisionKey) !== key) {
        throw new Error('Output path collision between distinct phonetic family keys: ' + path);
      }
      familyPaths.set(collisionKey, key);
      return { key: key, path: path, sound: sound, skeleton: skeleton, soundLabel: soundLabel, prettySkeleton: skeletonLabel };
    }

    records.forEach(function (record, i) {
      if (!record || typeof record !== 'object' || typeof record.text !== 'string' || typeof record.source !== 'string') {
        throw new TypeError('Record ' + (i + 1) + ' must have string text and source.');
      }
      if (record.line !== undefined && (!Number.isSafeInteger(record.line) || record.line < 1)) {
        throw new TypeError('Record ' + (i + 1) + ' line must be a positive safe integer when supplied.');
      }
      var textBytes = utf8Length(record.text);
      recordBytes.push(textBytes + 1);
      inputTextBytes += textBytes;
      // Every input text appears in both provenance and manifest, even blanks.
      assertByteBudget(inputTextBytes * 2);
      var normalized = normalizeText(record.text);
      if (normalized && /[\r\n]/.test(record.text)) {
        throw new TypeError('Record ' + (i + 1) + ' must contain one complete line (no CR/LF); split intake into line records first.');
      }
      var mapped = {
        id: i + 1, source: record.source, line: record.line === undefined ? null : record.line,
        text: record.text, normalized: normalized, status: 'blank', duplicateOf: null,
        letter: null, azPath: null, familyPaths: [], families: [], reviewReasons: [], familyAnalysis: 'not-applicable-blank'
      };
      mappedRecords.push(mapped);
      if (!normalized) { blankCount++; return; }
      if (canonical.has(normalized)) {
        mapped.status = 'duplicate';
        mapped.duplicateOf = canonical.get(normalized).id;
        mapped.reviewReasons.push('duplicate');
        mapped.familyAnalysis = 'duplicate-reference';
        duplicateCount++;
        review.push(mapped);
        return;
      }
      mapped.status = 'unique';
      canonical.set(normalized, mapped);
      uniqueRecords.push(mapped);
      mapped.sortKey = transliterate(normalized).replace(/^[^A-Z]+/, '');
      mapped.letter = firstLetter(record.text);
      if (!az.has(mapped.letter)) { az.set(mapped.letter, []); checkGroupMinimum(); }
      az.get(mapped.letter).push(mapped);
      estimatedViewBytes += textBytes + 1;
      assertByteBudget(estimatedViewBytes);
      var seenWords = new Set(), recordFamilies = new Map();
      mapped.familyAnalysis = 'analyzed';
      if (record.text.length > maxFamilyLineChars) mapped.familyAnalysis = 'skipped-long-line';
      else {
        seenWords = new Set(wordsIn(record.text));
        if (seenWords.size > maxFamilyWordsPerRecord) mapped.familyAnalysis = 'skipped-word-limit';
      }
      if (mapped.familyAnalysis !== 'analyzed') {
        analysisSkippedCount++;
        mapped.reviewReasons.push('family-analysis-skipped');
        seenWords.clear();
      }
      seenWords.forEach(function (word) {
        if (stopWords.has(word)) return;
        var family = familyFor(word);
        if (!family) return;
        if (!families.has(family.key)) {
          families.set(family.key, Object.assign({}, family, { records: [], words: new Set() }));
          checkGroupMinimum();
        }
        var group = families.get(family.key);
        group.words.add(word);
        if (!recordFamilies.has(family.key)) {
          familyLinkCount++;
          if (familyLinkCount > maxFamilyLinks) {
            throw new RangeError('Phonetic-family link limit exceeded: maxFamilyLinks=' + maxFamilyLinks + '. Split intake into smaller batches; no export was produced.');
          }
          estimatedViewBytes += textBytes + 1;
          assertByteBudget(estimatedViewBytes);
          recordFamilies.set(family.key, { sound: family.sound, skeleton: family.skeleton, prettySkeleton: family.prettySkeleton, path: family.path, words: [] });
          group.records.push(mapped);
        }
        recordFamilies.get(family.key).words.push(word);
      });
      mapped.families = Array.from(recordFamilies.values()).sort(function (a, b) { return compareStrings(a.path, b.path); });
      if (!mapped.families.length) {
        unclassifiedCount++;
        mapped.reviewReasons.push('no-phonetic-family');
      }
      if (mapped.letter === '_') {
        unknownCount++;
        mapped.reviewReasons.push('unknown-letter');
      }
      if (mapped.reviewReasons.length) review.push(mapped);
    });

    var provenanceCount = mappedRecords.length + originalInputs.length;
    var plannedFiles = 3 + originals.length + Math.max(1, Math.ceil(review.length / chunkLines)) + Math.max(1, Math.ceil(provenanceCount / chunkLines));
    az.forEach(function (list) { plannedFiles += Math.ceil(list.length / chunkLines); });
    families.forEach(function (group) { plannedFiles += Math.ceil(group.records.length / chunkLines); });
    if (plannedFiles > maxOutputFiles) {
      throw new RangeError('Output file limit exceeded: ' + plannedFiles + ' files require more than maxOutputFiles=' + maxOutputFiles + '. Split intake into smaller batches; no export was produced.');
    }

    var entries = [], groups = [], occupied = new Map(), outputBytes = 0;
    function claim(path, type) {
      path = validateRelativePath(path);
      var segments = path.split('/');
      for (var n = 1; n <= segments.length; n++) {
        var partial = segments.slice(0, n).join('/');
        var kind = n === segments.length ? type : 'directory';
        var key = pathKey(partial);
        var previous = occupied.get(key);
        if (previous && (previous.kind !== 'directory' || kind !== 'directory' || previous.path !== partial)) {
          throw new Error('Output path collision (Windows case-insensitive): ' + partial);
        }
        occupied.set(key, { kind: kind, path: partial });
      }
      return path;
    }
    function addEntry(path, data, kind, mime) {
      if (entries.length >= maxOutputFiles) throw new RangeError('Output file limit exceeded: maxOutputFiles=' + maxOutputFiles + '. Split intake into smaller batches; no export was produced.');
      var bytes = typeof data === 'string' ? utf8Length(data) : data.byteLength;
      assertByteBudget(outputBytes + bytes);
      outputBytes += bytes;
      entries.push({ path: claim(path, 'file'), data: data, mime: mime || 'text/plain;charset=utf-8', kind: kind });
    }
    function replaceData(entry, data) {
      var oldBytes = typeof entry.data === 'string' ? utf8Length(entry.data) : entry.data.byteLength;
      var newBytes = typeof data === 'string' ? utf8Length(data) : data.byteLength;
      assertByteBudget(outputBytes - oldBytes + newBytes);
      outputBytes += newBytes - oldBytes;
      entry.data = data;
    }
    function addTextGroup(path, label, type, list, filename, extra) {
      claim(path, 'directory');
      var group = Object.assign({ path: path, label: label, count: list.length, type: type, files: [] }, extra || {});
      list.sort(compareRecords);
      for (var offset = 0; offset < list.length; offset += chunkLines) {
        var part = list.slice(offset, offset + chunkLines);
        var file = path + '/' + filename(String(offset / chunkLines + 1).padStart(3, '0'));
        var partBytes = part.reduce(function (total, record) { return total + recordBytes[record.id - 1]; }, 0);
        assertByteBudget(outputBytes + partBytes);
        addEntry(file, part.map(function (record) { return record.text; }).join('\n') + '\n', type);
        group.files.push(file);
        part.forEach(function (record) {
          if (type === 'az') record.azPath = file;
          else record.familyPaths.push(file);
        });
      }
      groups.push(group);
      return group;
    }
    Array.from(az.keys()).sort(compareStrings).forEach(function (letter) {
      addTextGroup((letterBase ? letterBase + '/' : '') + letter, 'A-Z / ' + letter, 'az', az.get(letter), function (part) {
        return batchId + '_' + letter + '_' + part + '.txt';
      }, { letter: letter });
    });
    Array.from(families.values()).sort(function (a, b) { return compareStrings(a.path, b.path); }).forEach(function (family) {
      addTextGroup(family.path, family.soundLabel + ' / ' + family.prettySkeleton, 'family', family.records, function (part) {
        return batchId + '_' + part + '.txt';
      }, { sound: family.sound, skeleton: family.skeleton, prettySkeleton: family.prettySkeleton, words: Array.from(family.words).sort(compareStrings) });
    });
    mappedRecords.forEach(function (record) {
      delete record.sortKey;
      if (record.status === 'duplicate') {
        var first = mappedRecords[record.duplicateOf - 1];
        record.letter = first.letter;
        record.azPath = first.azPath;
        record.familyPaths = first.familyPaths.slice();
        record.families = first.families.map(function (family) { return Object.assign({}, family, { words: family.words.slice() }); });
      }
    });

    if (originals.length) {
      claim(runPath + '/Originals', 'directory');
      originalInputs.forEach(function (original, i) {
        var data = originals[i].data;
        assertByteBudget(outputBytes + original.byteLength);
        addEntry(original.path, typeof data === 'string' ? data : new Uint8Array(data), 'original', 'application/octet-stream');
      });
      groups.push({ path: runPath + '/Originals', label: 'Unchanged original copies', count: originals.length, type: 'originals', files: originalInputs.map(function (original) { return original.path; }) });
    }

    function addReportChunks(folder, stem, lines, kind, mime) {
      claim(folder, 'directory');
      var files = [];
      for (var offset = 0; offset < lines.length; offset += chunkLines) {
        var path = folder + '/' + batchId + '_' + stem + '_' + String(offset / chunkLines + 1).padStart(3, '0') + (kind === 'provenance' ? '.jsonl' : '.txt');
        addEntry(path, lines.slice(offset, offset + chunkLines).join('\n') + '\n', kind, mime);
        files.push(path);
      }
      return files;
    }
    var pendingReviewBytes = 0;
    var reviewLines = review.map(function (record) {
      var duplicate = record.duplicateOf ? mappedRecords[record.duplicateOf - 1] : null;
      assertByteBudget(outputBytes + pendingReviewBytes + jsonStringBytes(record.text) + jsonStringBytes(record.source));
      var line = record.reviewReasons.join(', ') + ' | record=' + record.id + ' | source=' + JSON.stringify(record.source) + ' | line=' + (record.line === null ? 'not supplied' : record.line) +
        (duplicate ? ' | same normalized text as record=' + duplicate.id + ' source=' + JSON.stringify(duplicate.source) + ' line=' + duplicate.line : '') +
        ' | family analysis=' + record.familyAnalysis +
        ' | A-Z copy=' + JSON.stringify(record.azPath) + ' | complete input text=' + JSON.stringify(record.text);
      pendingReviewBytes += utf8Length(line) + 1;
      assertByteBudget(outputBytes + pendingReviewBytes);
      return line;
    });
    if (!reviewLines.length) reviewLines.push('No duplicate or unclassified records. All original inputs and source mappings remain in the manifest and provenance files.');
    var reviewFiles = addReportChunks(runPath + '/Review', 'REVIEW', reviewLines, 'review');
    groups.push({ path: runPath + '/Review', label: 'Duplicates and unclassified review', count: review.length, type: 'review', files: reviewFiles });
    var pendingProvenanceBytes = 0;
    function provenanceLine(inputType, item) {
      var value = Object.assign({ inputType: inputType }, item);
      pendingProvenanceBytes += jsonByteLength(value, false) + 1;
      assertByteBudget(outputBytes + pendingProvenanceBytes);
      return JSON.stringify(value);
    }
    var provenanceLines = mappedRecords.map(function (record) { return provenanceLine('record', record); })
      .concat(originalInputs.map(function (original) { return provenanceLine('original', original); }));
    if (!provenanceLines.length) provenanceLines.push(JSON.stringify({ inputType: 'run', batchId: batchId, note: 'No input records or originals.' }));
    var provenanceFiles = addReportChunks(runPath + '/Provenance', 'PROVENANCE', provenanceLines, 'provenance', 'application/x-ndjson;charset=utf-8');

    var azGroups = groups.filter(function (group) { return group.type === 'az'; });
    var familyGroups = groups.filter(function (group) { return group.type === 'family'; });
    var summary = {
      inputRecords: records.length, nonblankRecords: records.length - blankCount, blankRecords: blankCount,
      uniqueRecords: uniqueRecords.length, duplicateRecords: duplicateCount, originalFiles: originals.length,
      azGroups: azGroups.length, azFiles: azGroups.reduce(function (total, group) { return total + group.files.length; }, 0),
      familyGroups: familyGroups.length, familyFiles: familyGroups.reduce(function (total, group) { return total + group.files.length; }, 0),
      familyPlacements: familyGroups.reduce(function (total, group) { return total + group.count; }, 0),
      unclassifiedRecords: unclassifiedCount, unknownLetterRecords: unknownCount, reviewRecords: review.length,
      familyAnalysisSkippedRecords: analysisSkippedCount,
      outputFiles: plannedFiles, chunkLines: chunkLines, letterBase: letterBase,
      maxFamilyLinks: maxFamilyLinks, maxOutputBytes: maxOutputBytes,
      maxFamilyLineChars: maxFamilyLineChars, maxFamilyWordsPerRecord: maxFamilyWordsPerRecord
    };
    var manifest = {
      formatVersion: 1, batchId: batchId, runPath: runPath, indexPath: indexPath, summary: summary,
      classification: {
        familyExplanation: FAMILY_NOTE, letterExplanation: LETTER_NOTE,
        duplicateNormalization: 'Unicode NFC, case, and whitespace only; punctuation is not removed. First complete nonblank input text is retained in A-Z and family views; every duplicate variant remains in Review and provenance.',
        stopWords: Array.from(stopWords).sort(compareStrings),
        analysisLimits: 'Lines exceeding maxFamilyLineChars or maxFamilyWordsPerRecord retain complete A-Z text but have family-analysis-skipped Review/provenance notes. Output-byte and family-link limits reject the whole batch; split intake into smaller batches.',
        originalCopies: 'Unchanged contents; safe flat batch-prefixed numbered copy names. Original supplied names remain in originals[].name. No source, archive, existing destination, or backup is opened, changed, or deleted.'
      },
      groups: groups, records: mappedRecords, originals: originalInputs,
      provenanceFiles: provenanceFiles, reviewFiles: reviewFiles,
      outputs: []
    };
    var summaryText = [
      'HORUS Separate & File — ' + batchId,
      'Additive output plan. Only new generated copies are listed; original sources and browser archive remain untouched.',
      '',
      'Input records: ' + summary.inputRecords,
      'Nonblank records: ' + summary.nonblankRecords,
      'Blank records (retained in provenance): ' + summary.blankRecords,
      'Unique complete lines filed: ' + summary.uniqueRecords,
      'Case/whitespace-normalized duplicates in Review: ' + summary.duplicateRecords,
      'Unchanged original copies: ' + summary.originalFiles,
      'A-Z folders / text files: ' + summary.azGroups + ' / ' + summary.azFiles,
      'Phonetic-family folders / text files: ' + summary.familyGroups + ' / ' + summary.familyFiles,
      'Family-view line placements (not additional unique inputs): ' + summary.familyPlacements,
      'Unique lines with no phonetic family (still filed in A-Z): ' + summary.unclassifiedRecords,
      'Unique lines under unknown letter _ (still filed in A-Z): ' + summary.unknownLetterRecords,
      'Input records needing review: ' + summary.reviewRecords,
      'Unique lines with family analysis skipped (complete A-Z text retained): ' + summary.familyAnalysisSkippedRecords,
      'Total generated files, including this summary, manifest and index: ' + summary.outputFiles,
      'Maximum complete lines per A-Z/family/report chunk: ' + chunkLines,
      'Maximum family links / output bytes: ' + maxFamilyLinks + ' / ' + maxOutputBytes,
      'Family-analysis character / unique-word limits per line: ' + maxFamilyLineChars + ' / ' + maxFamilyWordsPerRecord,
      '', FAMILY_NOTE, '', LETTER_NOTE, '',
      manifest.classification.duplicateNormalization,
      manifest.classification.analysisLimits,
      'Duplicate paths point to the first unique line; their exact alternate text and each source/line remain in Review and records[].',
      'Every input, including blanks, has a record id, original text, source, optional line, status, and actual generated-file mappings in the manifest and chunked provenance JSONL.',
      'Original supplied names and copy paths are listed in originals[]. No original name collision overwrites another copy.',
      '', 'Run directory: ' + runPath, 'Linked local index: ' + indexPath,
      'Manifest: ' + manifestPath, 'No network, dictionary, alliteration approval gate, rewriting, or source deletion is performed.'
    ].join('\n') + '\n';
    addEntry(summaryPath, summaryText, 'summary');

    // Reserve the last two files before generating the inventory and index.
    addEntry(manifestPath, '', 'manifest', 'application/json;charset=utf-8');
    addEntry(indexPath, '', 'index', 'text/html;charset=utf-8');
    manifest.outputs = entries.map(function (entry) { return { path: entry.path, kind: entry.kind, mime: entry.mime }; });
    assertByteBudget(outputBytes + jsonByteLength(manifest, true) + 1);
    replaceData(entries[entries.length - 2], JSON.stringify(manifest, null, 2) + '\n');

    function link(path, label, directory, download) {
      return '<a href="' + htmlEscape(relativeHref(runPath, path, directory)) + '"' + (download ? ' download' : '') + '>' + htmlEscape(label) + '</a>';
    }
    var groupHtml = groups.map(function (group) {
      return '<li>' + link(group.path, group.label, true) + ' — ' + group.count + (group.type === 'originals' ? ' copies' : ' lines/records') + '<ul>' +
        group.files.map(function (file) { return '<li>' + link(file, file.split('/').pop(), false, true) + '</li>'; }).join('') + '</ul></li>';
    }).join('\n');
    var inventoryHtml = entries.map(function (entry) {
      return '<li>' + link(entry.path, entry.path + ' [' + entry.kind + ']', false, true) + '</li>';
    }).join('\n');
    var indexParts = [
      '<!doctype html>', '<html lang="en"><head><meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      '<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;; base-uri &#39;none&#39;; form-action &#39;none&#39;">',
      '<title>HORUS run ' + htmlEscape(batchId) + '</title>',
      '<style>body{font:16px/1.5 system-ui,sans-serif;margin:2rem auto;padding:0 1rem;max-width:70rem;color:#173b3b;background:#f7faf9}a{color:#075e66;overflow-wrap:anywhere}li{margin:.35rem 0}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#fff;padding:1rem;border:1px solid #cbd8d6}h1,h2{line-height:1.2}</style>',
      '</head><body><h1>HORUS Separate &amp; File — ' + htmlEscape(batchId) + '</h1>',
      '<p>This is a saved, offline, read-only index of actual generated paths. Preserve the output folder tree when extracting the ZIP. Folder links may be handled differently by individual browsers; the file links below are direct relative paths.</p>',
      '<p>' + link(summaryPath, 'Readable summary', false, true) + ' · ' + link(manifestPath, 'Full provenance manifest', false, true) + '</p>',
      '<p>' + htmlEscape(FAMILY_NOTE) + '</p>',
      '<h2>Run facts</h2><pre>' + htmlEscape(summaryText) + '</pre>',
      '<h2>Generated folders and chunks</h2><ul>' + groupHtml + '</ul>',
      '<h2>All generated files</h2><p>Links to original copies request download, rather than embedding or executing their contents. Nothing is uploaded or fetched by this index.</p><ul>' + inventoryHtml + '</ul>',
      '</body></html>', ''
    ];
    assertByteBudget(outputBytes + indexParts.reduce(function (total, part) { return total + utf8Length(part); }, indexParts.length - 1));
    replaceData(entries[entries.length - 1], indexParts.join('\n'));
    if (entries.length !== plannedFiles) throw new Error('Internal export file-count mismatch. No export was produced.');
    return { batchId: batchId, entries: entries, groups: groups, summary: summary, manifest: manifest, runPath: runPath, indexPath: indexPath };
  }

  return Object.freeze({
    planExport: planExport, validateSegment: validateSegment, validateRelativePath: validateRelativePath,
    normalizeText: normalizeText, firstLetter: firstLetter, relativeHref: relativeHref
  });
});
