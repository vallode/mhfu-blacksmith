#!/bin/bash

for weapon in $(find *.png | sed -E -e 's/-black.png|-white.png//g' | uniq)
do
  echo $weapon

  convert ${weapon}-black.png -gravity Center -background Black -extent 800x600 weapon_black.png
  convert ${weapon}-white.png -gravity Center -background White -extent 800x600 weapon_white.png

  convert weapon_black.png weapon_white.png -alpha off \
    \( -clone 0,1 -compose difference -composite -negate \) \
    \( -clone 0,2 +swap -compose divide -composite \) \
    -delete 0,1 +swap -compose Copy_Opacity -composite \
    output/${weapon}.png
done