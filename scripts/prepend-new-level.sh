
echo "——————————" > /tmp/experimental-levels.txt
level-gen --words --orthogonal --dictionary ./words-and-levels/words.txt >> /tmp/experimental-levels.txt
cat ./words-and-levels/experimental-levels.txt >> /tmp/experimental-levels.txt
mv /tmp/experimental-levels.txt ./words-and-levels/experimental-levels.txt

