// requireDir.js
// See README.md for details.

let fs = require('fs');
let path = require('path');


// make a note of the calling file's path, so that we can resolve relative
// paths. this only works if a fresh version of this module is run on every
// require(), so important: we clear the require() cache each time!
// let parent = module.parent;
// let parentFile = parent.filename;
// let parentDir = path.dirname(parentFile);
// delete require.cache[__filename];

module.exports = function requireDir(dir, opts) {
    // default arguments:
    dir = dir || '.';
    opts = opts || {};
    
    // resolve the path to an absolute one:
    // dir = path.resolve(parentDir, dir);
    
    let parentFile;
    if (dir[0] === '.') {
        const err = {};
        Error.captureStackTrace(err, requireDir);
        let lines = err.stack.split('\n');
        let match = lines[1].match(/file:\/\/(.+\.mjs):\d+:\d+$/);
        if (match) {
            parentFile = match[1];
        } else {
            parentFile = lines[1].match(/\((.+):\d+:\d+\)/)[1];
        }
        dir = path.resolve(path.dirname(parentFile), dir);
    } else {
        parentFile = path.join(dir, 'index.js');
    }
    
    // read the directory's files:
    // note that this'll throw an error if the path isn't a directory.
    let files = fs.readdirSync(dir);
    
    // to prioritize between multiple files with the same basename, we'll
    // first derive all the basenames and create a map from them to files:
    let filesForBase = {};
    
    for (let i = 0; i < files.length; i++) {
        let file = files[i];
        let ext = path.extname(file);
        let base = path.basename(file, ext);
        (filesForBase[base] = filesForBase[base] || []).push(file);
    }
    
    // then we'll go through each basename, and first check if any of the
    // basenames' files are directories, since directories take precedence if
    // we're recursing and can be ignored if we're not. if a basename has no
    // directory, then we'll follow Node's own require() algorithm of going
    // through and trying the require.extension keys in order. in the process,
    // we create and return a map from basename to require()'d contents! and
    // if duplicates are asked for, we'll never short-circuit; we'll just add
    // to the map using the full filename as a key also.
    let map = {};
    
    // get the array of extensions we need to require
    let extensions = opts.extensions || Object.keys(require.extensions);

    for (let base in filesForBase) {
        // protect against enumerable object prototype extensions:
        if (!filesForBase.hasOwnProperty(base)) {
            continue;
        }
        
        // go through the files for this base and check for directories. we'll
        // also create a hash "set" of the non-dir files so that we can
        // efficiently check for existence in the next step:
        let files = filesForBase[base];
        let filesMinusDirs = {};
        
        for (let i = 0; i < files.length; i++) {
            let file = files[i];
            let abs = path.resolve(dir, file);
            
            // ignore the calling file:
            if (abs === parentFile) {
                continue;
            }
            // apply file filter:
            if (opts.filter && !opts.filter(abs)) {
                continue;
            }
            
            if (fs.statSync(abs).isDirectory()) {
                if (opts.recurse) {
                    if (base === 'node_modules') {
                        continue;
                    }
                    
                    map[base] = requireDir(abs, opts);
                    
                    // if duplicates are wanted, key off the full name too:
                    if (opts.duplicates) {
                        map[file] = map[base];
                    }
                }
            } else {
                filesMinusDirs[file] = abs;
            }
        }
        
        // if we're recursing and we already encountered a directory for this
        // basename, we're done for this base if we're ignoring duplicates:
        if (map[base] && !opts.duplicates) {
            continue;
        }
        
        // otherwise, go through and try each require.extension key!
        for (ext of extensions) {
            // if a file exists with this extension, we'll require() it:
            let file = base + ext;
            let abs = filesMinusDirs[file];
            
            if (abs) {
                // ignore TypeScript declaration files. They should never be
                // `require`d
                if (/\.d\.ts$/.test(abs)) {
                    continue;
                }
                
                // delete cache
                if (opts.noCache) {
                    delete require.cache[abs];
                }

                // if duplicates are wanted, key off the full name always, and
                // also the base if it hasn't been taken yet (since this ext
                // has higher priority than any that follow it). if duplicates
                // aren't wanted, we're done with this basename.
                if (opts.duplicates) {
                    map[file] = require(abs);
                    if (!map[base]) {
                        map[base] = map[file];
                    }
                } else {
                    map[base] = require(abs);
                    break;
                }
            }
        }
    }
    
    if (opts.mapKey || opts.mapValue) {
        for (let base in map) {
            // protect against enumerable object prototype extensions:
            if (!map.hasOwnProperty(base)) {
                continue;
            }

            let newKey = opts.mapKey ? opts.mapKey(map[base], base) : base;
            let newVal = opts.mapValue ? opts.mapValue(map[base], newKey) : map[base];
            delete map[base];
            map[newKey] = newVal;
        }
    }
    return map;
};
