
cd ../level-gen
#cargo run -- --shape 3,2,4,4
cargo run -- "$@"
cd ../perplexions
echo "——————————" > /tmp/experimental-levels.txt
cat ../level-gen/levels-experimental.txt       >> /tmp/experimental-levels.txt
cat ./words-and-levels/experimental-levels.txt >> /tmp/experimental-levels.txt
mv /tmp/experimental-levels.txt ./words-and-levels/experimental-levels.txt

