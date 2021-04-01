#!/usr/bin/env bash

# requires imagemagick

set -e # exit when any command fails

cd src
i='nixos.svg'

for s in 24 48
do
	#o="../dist/$i.$s.png"
	o="$i.$s.png"
	echo convert -size ${s}x -background none "$i" "$o"
	convert -size ${s}x -background none "$i" "$o"
done
