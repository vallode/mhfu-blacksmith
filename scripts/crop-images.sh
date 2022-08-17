#!/bin/bash

for composite in $(find $weapon-*.png)
do
  magick $composite -crop 608x406+40+305 \
    +repage -set background:fn '%[hex:p{0,0}]' -trim -gravity Center \
    -background '#%[background:fn]' -extent 800x600 \
    -set filename:name '%[basename]' '%[filename:name]-composite.png'
done