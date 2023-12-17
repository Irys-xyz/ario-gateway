for i in `find ./data -maxdepth 1 -mindepth 1 -type d ` # Finds all the subfolders and loop.
do
    echo $i
    sudo rm -rf ${i}
    mkdir ${i}
done

yarn db:migrate up