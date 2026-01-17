'use strict'

import clear from 'rollup-plugin-clear'
import resolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import typescript from 'rollup-plugin-typescript2'

export default {
    input: 'src/arena/spawn-strike/main.ts',
    output: {
        file: 'arena-dist/main.mjs',
        format: 'esm',
        sourcemap: true,
    },
    external: (id) => {
        // Treat all game/* imports as external (provided by Screeps Arena runtime)
        return id.startsWith('game/')
    },

    plugins: [
        clear({ targets: ['arena-dist'] }),
        resolve({ rootDir: 'src' }),
        commonjs(),
        typescript({ tsconfig: './tsconfig.arena.json' }),
    ],
}
