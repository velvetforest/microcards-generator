#!/bin/sh
sed 's#</script#<\\/script#g' content-guide.md > .guide.tmp
sed -e '/__STYLE_GUIDE__/{r .guide.tmp' -e 'd}' template.html > index.html
rm -f .guide.tmp
