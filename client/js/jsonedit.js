let jeEnabled = false;
let jeZoomOut = false;
let jeWidget = null;
let jeStateBefore = null;
let jeStateNow = null;
let jeJSONerror = null;
let jeContext = null;
const jeState = {
  ctrl: false,
  shift: false,
  mouseX: 0,
  mouseY: 0,
  widget: null
};

const jeCommands = [
  {
    name: 'toggle boolean',
    context: '"(true|false)"',
    call: function() {
      jeInsert(jeContext.slice(1), jeContext[jeContext.length-2], jeContext[jeContext.length-1]=='"false"');
    }
  },
  {
    name: 'toggle zoom out',
    forceKey: 'Z',
    call: function() {
      jeZoomOut = !jeZoomOut;
      if(jeZoomOut) {
        $('body').classList.add('jeZoomOut');
      } else {
        $('body').classList.remove('jeZoomOut');
      }
      setScale();
    }
  },
  {
    name: _=>`remove property ${jeContext && jeContext[jeContext.length-1]}`,
    forceKey: 'D',
    context: ' ↦ (?=[^"]+$)',
    call: function() {
      let pointer = jeGetValue();
      delete pointer[jeContext[jeContext.length-1]];

      const oldStart = $('#jeText').selectionStart;
      const oldEnd   = $('#jeText').selectionEnd;
      $('#jeText').value = JSON.stringify(jeStateNow, null, '  ');
      $('#jeText').selectionStart = oldStart;
      $('#jeText').selectionEnd   = oldEnd;
    },
    show: function() {
      return jeStateNow && jeGetValue()[jeContext[jeContext.length-1]] !== undefined;
    }
  },
  {
    name: _=>jeJSONerror?'go to error':'apply changes',
    forceKey: ' ',
    call: function() {
      if(jeJSONerror) {
        const location = String(jeJSONerror).match(/line ([0-9]+) column ([0-9]+)/);
        if(location)
          $('#jeText').selectionStart = $('#jeText').selectionEnd = $('#jeText').value.split('\n').slice(0, location[1]-1).join('\n').length + +location[2];
      } else {
        $('#editWidgetJSON').dataset.previousState = jeStateBefore;
        $('#editWidgetJSON').value = $('#jeText').value;
        $('#updateWidgetJSON').click();
      }
    }
  },
  {
    name: _=>`change ${jeContext && jeContext[4]} to applyVariables`,
    context: '^button.*\\) ↦ [a-zA-Z]+',
    call: function() {
      const operation = jeGetValue(jeContext.slice(1, 3));
      delete operation[jeContext[4]];
      if(!operation.applyVariables)
        operation.applyVariables = [];
      operation.applyVariables.push({ parameter: jeContext[4], variable: '###SELECT ME###' });
      jeSetAndSelect('');
    },
    show: function() {
      return jeContext && jeContext[4] != 'applyVariables';
    }
  }
];

function jeAddButtonOperationCommands(command, defaults) {
  defaults.skip = false;
  for(const property in defaults) {
    jeCommands.push({
      name: property,
      context: `^button.* ↦ \\(${command}\\) ↦ `,
      call: function() {
        jeInsert(jeContext.slice(1, 3), property, defaults[property]);
      },
      show: function() {
        return jeStateNow && jeGetValue()[property] === undefined;
      }
    });
  }
}

function jeAddCommands() {
  jeAddWidgetPropertyCommands(new BasicWidget());
  jeAddWidgetPropertyCommands(new Button());
  jeAddWidgetPropertyCommands(new Card());
  jeAddWidgetPropertyCommands(new Deck());
  jeAddWidgetPropertyCommands(new Holder());
  jeAddWidgetPropertyCommands(new Label());
  jeAddWidgetPropertyCommands(new Pile());
  jeAddWidgetPropertyCommands(new Spinner());

  jeAddButtonOperationCommands('CLICK', { collection: 'DEFAULT', count: 1 });
  jeAddButtonOperationCommands('COMPUTE', { operation: '+', operand1: 1, operand2: 1, operand3: 1, variable: 'COMPUTE' });
  jeAddButtonOperationCommands('COUNT', { collection: 'DEFAULT', variable: 'COUNT' });
  jeAddButtonOperationCommands('FLIP', { count: 0, face: null });
  jeAddButtonOperationCommands('GET', { variable: 'id', collection: 'DEFAULT', property: 'id', aggregation: 'first' });
  // INPUT is missing
  jeAddButtonOperationCommands('LABEL', { value: 0, mode: 'set', label: null });
  jeAddButtonOperationCommands('MOVE', { count: 1, face: null, from: null, to: null });
  jeAddButtonOperationCommands('MOVEXY', { count: 1, face: null, from: null, x: 0, y: 0 });
  jeAddButtonOperationCommands('RANDOM', { min: 1, max: 10, variable: 'RANDOM' });
  jeAddButtonOperationCommands('RECALL', { owned: true, holder: null });
  jeAddButtonOperationCommands('ROTATE', { count: 1, angle: 90, mode: 'add', holder: null });
  jeAddButtonOperationCommands('SELECT', { type: 'all', property: 'parent', relation: '==', value: null, max: 999999, collection: 'DEFAULT', mode: 'add', source: 'all' });
  jeAddButtonOperationCommands('SET', { collection: 'DEFAULT', property: 'parent', relation: '=', value: null });
  jeAddButtonOperationCommands('SORT', { key: 'value', reverse: false, holder: null });
  jeAddButtonOperationCommands('SHUFFLE', { holder: null });
}

function jeAddWidgetPropertyCommands(object) {
  for(const property in object.defaults)
    if(property != 'typeClasses')
      jeAddWidgetPropertyCommand(object.defaults, property);
  object.applyRemove();
}

function jeAddWidgetPropertyCommand(defaults, property) {
  jeCommands.push({
    name: property,
    context: `^${defaults.typeClasses.replace('widget ', '')}`,
    call: function() {
      jeInsert([], property, defaults[property]);
    },
    show: function() {
      return jeStateNow && jeStateNow[property] === undefined;
    }
  });
}

function jeClick(widget, e) {
  if(jeState.ctrl) {
    jeWidget = widget;
    $('#jeText').value = jeStateBefore = JSON.stringify(widget.state, null, '  ');
    $('#jeText').focus();
  } else if(widget.click) {
    widget.click();
  }
}

function jeGetContext() {
  if(!jeWidget)
    return [];

  const s = $('#jeText').selectionStart;
  const e = $('#jeText').selectionEnd;
  const v = $('#jeText').value;
  const t = jeWidget.p('type') || 'basic';

  const select = v.substr(s, e-s);
  const line = v.substr(0, s).split('\n').pop();

  try {
    jeStateNow = JSON.parse(v);
    jeJSONerror = null;
  } catch(e) {
    jeStateNow = null;
    jeJSONerror = e;
  }

  let keys = [ t ];
  for(const line of v.substr(0, s).split('\n')) {
    const m = line.match(/^( +)(["{])([^"]*)/);
    if(m) {
      const depth = m[1].length/2;
      keys[depth] = m[2]=='{' ? (keys[depth] === undefined ? -1 : keys[depth]) + 1 : m[3];
      keys = keys.slice(0, depth+1);
    }
  }
  try {
    if(keys[1] == 'clickRoutine' && typeof keys[2] == 'number' && !jeJSONerror)
      keys.splice(3, 0, '(' + jeStateNow.clickRoutine[keys[2]].func + ')');
  } catch(e) {}

  if(select)
    keys.push(`"${select}"`);

  jeContext = keys;

  jeShowCommands();

  return jeContext;
}

function jeGetValue(context, all) {
  let pointer = jeStateNow;
  for(const key of context || jeContext)
    if(all && typeof pointer[key] !== undefined || typeof pointer[key] == 'object')
      pointer = pointer[key];
  return pointer
}

function jeInsert(context, key, value) {
  if(!jeJSONerror) {
    let pointer = jeGetValue(context);
    pointer[key] = '###SELECT ME###';
    jeSetAndSelect(value);
  }
}

function jeSetAndSelect(replaceBy) {
  let jsonString = JSON.stringify(jeStateNow, null, '  ');
  const startIndex = jsonString.indexOf('"###SELECT ME###"');
  let length = jsonString.length-17;

  jsonString = JSON.stringify(jeStateNow, null, '  ').replace(/"###SELECT ME###"/, JSON.stringify(replaceBy));

  $('#jeText').value = jsonString;
  $('#jeText').selectionStart = startIndex + (typeof replaceBy == 'string' ? 1 : 0);
  $('#jeText').selectionEnd = startIndex+jsonString.length-length - (typeof replaceBy == 'string' ? 1 : 0);
  $('#jeText').focus();
}

function jeShowCommands() {
  const activeCommands = {};

  const context = jeContext.join(' ↦ ');
  for(const command of jeCommands) {
    delete command.currentKey;
    const contextMatch = context.match(new RegExp(command.context));
    if(contextMatch && (!command.show || command.show())) {
      if(activeCommands[contextMatch[0]] === undefined)
        activeCommands[contextMatch[0]] = [];
      activeCommands[contextMatch[0]].push(command);
    }
  }

  const usedKeys = { c: 1, x: 1, v: 1, w: 1, n: 1, t: 1, q: 1, j: 1, z: 1 };
  let commandText = '';

  const sortByName = function(a, b) {
    const nameA = typeof a.name == 'function' ? a.name() : a.name;
    const nameB = typeof b.name == 'function' ? b.name() : b.name;
    return nameA.localeCompare(nameB);
  }

  for(const contextMatch of (Object.keys(activeCommands).sort((a,b)=>b.length-a.length))) {
    commandText += `\n  <b>${contextMatch}</b>\n`;
    for(const command of activeCommands[contextMatch].sort(sortByName)) {
      if(context.match(new RegExp(command.context)) && (!command.show || command.show())) {
        const name = typeof command.name == 'function' ? command.name() : command.name;
        if(command.forceKey && !usedKeys[command.forceKey])
          command.currentKey = command.forceKey;
        for(const key of name.split(''))
          if(key != ' ' && !command.currentKey && !usedKeys[key.toLowerCase()])
            command.currentKey = key.toLowerCase();
        for(const key of 'abcdefghijklmnopqrstuvwxyz1234567890'.split(''))
          if(!command.currentKey && !usedKeys[key])
            command.currentKey = key;
        usedKeys[command.currentKey] = true;
        commandText += `Ctrl-${command.currentKey}: ${name.replace(command.currentKey, '<b>' + command.currentKey + '</b>')}\n`;
      }
    }
  }
  commandText += `\n${context}\n`;
  if(jeJSONerror)
    commandText += `\n${String(jeJSONerror)}\n`;
  $('#jeCommands').innerHTML = commandText;
}

window.addEventListener('mousemove', function(e) {
  jeState.mouseX = Math.floor((e.clientX - roomRectangle.left) / scale);
  jeState.mouseY = Math.floor((e.clientY - roomRectangle.top ) / scale);
});

window.addEventListener('mouseup', function(e) {
  if(e.target == $('#jeText'))
    jeGetContext();
});

window.addEventListener('keydown', function(e) {
  if(e.key == 'Control')
    jeState.ctrl = true;
  if(e.key == 'Shift')
    jeState.shift = true;

  if(jeState.ctrl) {
    if(e.key == 'j') {
      e.preventDefault();
      jeEnabled = !jeEnabled;
      if(jeEnabled) {
        $('body').classList.add('jsonEdit');
        jeAddCommands();
        $('#jeText').focus();
      } else {
        $('body').classList.remove('jsonEdit');
      }
      setScale();
    } else {
      for(const command of jeCommands) {
        if(command.currentKey == e.key) {
          e.preventDefault();
          command.call();
        }
      }
    }
  }
});

window.addEventListener('keyup', function(e) {
  if(e.key == 'Control')
    jeState.ctrl = false;
  if(e.key == 'Shift')
    jeState.shift = false;

  if(e.target == $('#jeText'))
    jeGetContext();
});
