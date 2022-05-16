pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/mux1.circom";

template Selector() {
    signal input input_element;
    signal input path_element;
    signal input path_index;

    signal output left;
    signal output right;

    component mux = MultiMux1(2);
    mux.c[0][0] <== input_element;
    mux.c[0][1] <== path_element;
    mux.c[1][0] <== path_element;
    mux.c[1][1] <== input_element;

    mux.s <== path_index;

    left <== mux.out[0];
    right <== mux.out[1];
}

template CheckRoot(n) { // compute the root of a MerkleTree of n Levels 
    signal input leaves[2**n];
    signal output root;

    //[assignment] insert your code here to calculate the Merkle root from 2^n leaves
    if (n == 0 ){
        root <== leaves[0];
    }
    component checkRoot[n-1];
    component poseidon[n-1];
    for (var i = 0; i < 2**n / 2; i++) {
        var nextLevel = i/2;
        poseidon[i] = Poseidon(2);
        if (!checkRoot[nextLevel]) {
            checkRoot[nextLevel] = CheckRoot(i);
        }
        poseidon[i].inputs[0] <== leaves[2*n];
        poseidon[i].inputs[1] <== leaves[2*n + 1];
        checkRoot[nextLevel].leaves[i] <== poseidon[i].out;
    }
}

template MerkleTreeInclusionProof(n) {
    signal input leaf;
    signal input path_elements[n];
    signal input path_index[n]; // path index are 0's and 1's indicating whether the current element is on the left or right
    signal output root; // note that this is an OUTPUT signal

    //[assignment] insert your code here to compute the root from a leaf and elements along the path
    component poseidon[n];
    component selector[n];

    var hash = leaf;
    for (var i = 0; i < n; i++) {
        poseidon[i] = Poseidon(2);
        selector[i] = Selector();

        selector[i].input_element <== leaf;
        selector[i].path_element <== path_elements[i];
        selector[i].path_index <== path_index[i];

        poseidon[i].inputs[0] <== selector[i].left;
        poseidon[i].inputs[1] <== selector[i].right;

        hash = poseidon[i].out;
    }
    root <== hash;

}