
cd ../level-gen
#cargo run -- --shape 3,2,4,4
cargo run -- "$@"
cd ../perplexions
echo "——————————" > /tmp/levels-experimental.txt
cat ../level-gen/levels-experimental.txt       >> /tmp/levels-experimental.txt
cat ./words-and-levels/levels-experimental.txt >> /tmp/levels-experimental.txt
mv /tmp/levels-experimental.txt ./words-and-levels/levels-experimental.txt

