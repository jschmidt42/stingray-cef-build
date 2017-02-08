Stingray - Gulp CEF Build Script
================================

Download, build and package CEF for the Stingray Editor

See https://www.stingrayengine.com for more information on Stingray.

### Generate solution and Build

Install NPM modules
> npm install

Run gulp build task
> gulp download build --cef 3.2924.1564.g0ba0378

Builds are downloaded from http://opensource.spotify.com/cefbuilds/index.html#windows64_builds

### What the script is doing...

1. Download CEF standard package...

2. Create cmake build folder
> mkdir build
> cd build

3. Generate solution using cmake

First we replace `/MT` compile options to `/MD` (Multithread DLL) in cmake scripts.

> cmake -G "Visual Studio 14 Win64" .. -DUSE_SANDBOX=OFF

4. Build solution using cmake in Debug and Release
> cmake --build . --target libcef_dll_wrapper --config Debug|Release

5. Create this structure in the cef packaged destination lib folder

```
+---include
+---Resources
\---x64
    +---Debug
    \---Release
```

6. Copy Debug/ to  x64/
7. Copy Release/ to  x64/
8. Copy include/ folder to lib folder
9. Copy Resources/ to lib folder
10. Move Resources/icudtl.dat to x64/Debug and x64/Release
11. Copy "build\libcef_dll\Debug\libcef_dll_wrapper.lib" to x64/Debug/
12. Copy "build\libcef_dll\Release\libcef_dll_wrapper.lib" to x64/Release/

### Command Line Usages

```
> gulp

Options:
  --cef, -c  CEF build version to be downloaded, see
             http://opensource.spotify.com/cefbuilds         [string] [required]
  --libs     Stingray libs destination folder, i.e. %SR_LIB_DIR%
                              [string] [required] [default: "E:\\stingray-libs"]

Examples:
  gulp --cef <cef build version #>  i.e. 3.2924.1564.g0ba0378
```
